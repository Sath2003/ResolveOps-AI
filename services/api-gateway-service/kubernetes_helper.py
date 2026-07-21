import yaml
import os
import json
from kubernetes import client, config
from kubernetes.client.rest import ApiException
from azure.mgmt.containerservice import ContainerServiceClient
from azure.core.exceptions import HttpResponseError

class AKSPermissionError(Exception):
    def __init__(self, message, error_data):
        super().__init__(message)
        self.error_data = error_data

def fetch_aks_kubeconfig(credential, subscription_id, resource_group_name, cluster_name):
    containerservice_client = ContainerServiceClient(credential, subscription_id)
    try:
        # 1. Try to use list_cluster_user_credentials
        credentials = containerservice_client.managed_clusters.list_cluster_user_credentials(resource_group_name, cluster_name)
        kubeconfig_bytes = credentials.kubeconfigs[0].value
        return kubeconfig_bytes.decode('utf-8')
    except HttpResponseError as e:
        if e.status_code in [403, 401]:
            # 2. Fallback to list_cluster_admin_credentials only if explicitly allowed
            if os.environ.get("ALLOW_AKS_ADMIN_CREDENTIALS", "false").lower() == "true":
                try:
                    credentials = containerservice_client.managed_clusters.list_cluster_admin_credentials(resource_group_name, cluster_name)
                    kubeconfig_bytes = credentials.kubeconfigs[0].value
                    return kubeconfig_bytes.decode('utf-8')
                except HttpResponseError:
                    pass
            
            error_data = {
                "status": "permission_missing",
                "title": "Kubernetes Connection Failed",
                "message": "Service principal does not have permission to retrieve AKS kubeconfig.",
                "recommended_action": "Assign Azure Kubernetes Service Cluster User Role to the NexusAI service principal at the AKS cluster scope.",
                "required_role": "Azure Kubernetes Service Cluster User Role",
                "scope_recommendation": "Assign at AKS cluster scope first.",
                "troubleshooting_steps": []
            }
            raise AKSPermissionError(error_data["message"], error_data)
        raise Exception(f"Failed to fetch kubeconfig: {e.message}")

def get_kubernetes_workloads(kubeconfig_yaml):
    try:
        kubeconfig_dict = yaml.safe_load(kubeconfig_yaml)
        api_client = config.new_client_from_config_dict(kubeconfig_dict)
        core_v1 = client.CoreV1Api(api_client)
        apps_v1 = client.AppsV1Api(api_client)
        
        data = {
            "enabled": True,
            "connection_status": "connected",
            "summary": {},
            "namespaces": [],
            "nodes": [],
            "pods": [],
            "deployments": [],
            "services": [],
            "events": [],
            "risks": [],
            "errors": []
        }
        
        # Namespaces
        try:
            ns_list = core_v1.list_namespace(timeout_seconds=5)
            data["namespaces"] = [ns.metadata.name for ns in ns_list.items]
            data["summary"]["namespaces"] = len(data["namespaces"])
        except ApiException as e:
            if e.status in [401, 403]:
                return _generate_k8s_error("rbac_denied", "Kubeconfig was retrieved, but Kubernetes RBAC denied access to workloads.", "Create a Kubernetes RoleBinding or ClusterRoleBinding that allows the NexusAI identity to read pods, nodes, deployments, services, and events.")
            return _generate_k8s_error("api_unreachable", "AKS API server unreachable. This may be a private AKS cluster or network connectivity issue.", "Run NexusAI inside Azure VNet/AKS, configure VPN/private connectivity, or use an in-cluster agent.")
        except Exception as e:
            return _generate_k8s_error("api_unreachable", "AKS API server unreachable. This may be a private AKS cluster or network connectivity issue.", "Run NexusAI inside Azure VNet/AKS, configure VPN/private connectivity, or use an in-cluster agent.")
            
        # Nodes
        try:
            nodes = core_v1.list_node(timeout_seconds=5)
            for n in nodes.items:
                ready_status = next((c.status for c in n.status.conditions if c.type == "Ready"), "Unknown")
                data["nodes"].append({
                    "name": n.metadata.name,
                    "ready_status": ready_status,
                    "kubernetes_version": n.status.node_info.kubelet_version,
                    "os_image": n.status.node_info.os_image,
                    "instance_type": n.metadata.labels.get("node.kubernetes.io/instance-type", "Unknown"),
                    "cpu_capacity": n.status.capacity.get("cpu"),
                    "memory_capacity": n.status.capacity.get("memory"),
                    "cpu_allocatable": n.status.allocatable.get("cpu"),
                    "memory_allocatable": n.status.allocatable.get("memory"),
                    "conditions": [{"type": c.type, "status": c.status, "message": c.message} for c in n.status.conditions]
                })
            data["summary"]["nodes"] = len(data["nodes"])
        except Exception:
            pass

        # Pods
        try:
            pods = core_v1.list_pod_for_all_namespaces(timeout_seconds=5)
            running_count = 0
            failed_count = 0
            pending_count = 0
            
            for p in pods.items:
                status = p.status.phase
                if status == "Running": running_count += 1
                elif status == "Failed": failed_count += 1
                elif status == "Pending": pending_count += 1
                
                restart_count = sum([c.restart_count for c in p.status.container_statuses]) if p.status.container_statuses else 0
                
                containers = []
                if p.status.container_statuses:
                    for c in p.status.container_statuses:
                        state = c.state
                        waiting_reason = state.waiting.reason if state.waiting else None
                        term_reason = state.terminated.reason if state.terminated else None
                        containers.append({
                            "name": c.name,
                            "image": c.image,
                            "ready": c.ready,
                            "waiting_reason": waiting_reason,
                            "termination_reason": term_reason
                        })
                
                data["pods"].append({
                    "name": p.metadata.name,
                    "namespace": p.metadata.namespace,
                    "status": status,
                    "node_name": p.spec.node_name,
                    "restart_count": restart_count,
                    "containers": containers,
                    "start_time": p.status.start_time.isoformat() if p.status.start_time else None,
                    "labels": p.metadata.labels,
                    "owner": p.metadata.owner_references[0].name if p.metadata.owner_references else None
                })
                
                # Basic AKS Issue Detection
                if status == "Failed":
                    data["risks"].append({
                        "severity": "high", "type": "PodFailed", "resource": f"pod/{p.metadata.name}",
                        "namespace": p.metadata.namespace, "evidence": f"Pod is in Failed phase",
                        "recommendation": "Check container logs to understand why the pod failed to start."
                    })
                elif status == "Pending":
                    data["risks"].append({
                        "severity": "medium", "type": "PodPending", "resource": f"pod/{p.metadata.name}",
                        "namespace": p.metadata.namespace, "evidence": f"Pod is stuck in Pending phase",
                        "recommendation": "Check if cluster has sufficient resources or if there are unschedulable taints."
                    })
                if restart_count > 5:
                    data["risks"].append({
                        "severity": "high", "type": "HighRestartCount", "resource": f"pod/{p.metadata.name}",
                        "namespace": p.metadata.namespace, "evidence": f"Container restart count is {restart_count}",
                        "recommendation": "Check container logs, environment variables, image, probes, and resource limits."
                    })
                for c in containers:
                    if c["waiting_reason"] == "CrashLoopBackOff":
                        data["risks"].append({
                            "severity": "critical", "type": "CrashLoopBackOff", "resource": f"pod/{p.metadata.name}",
                            "namespace": p.metadata.namespace, "evidence": f"Container {c['name']} is in CrashLoopBackOff",
                            "recommendation": "Check container logs for application crashes."
                        })
                    elif c["waiting_reason"] in ["ImagePullBackOff", "ErrImagePull"]:
                        data["risks"].append({
                            "severity": "high", "type": c["waiting_reason"], "resource": f"pod/{p.metadata.name}",
                            "namespace": p.metadata.namespace, "evidence": f"Failed to pull image {c['image']}",
                            "recommendation": "Check image name, tag, and container registry credentials."
                        })
                        
            data["summary"]["pods"] = len(data["pods"])
            data["summary"]["running_pods"] = running_count
            data["summary"]["failed_pods"] = failed_count
            data["summary"]["pending_pods"] = pending_count
        except Exception:
            pass
            
        # Deployments
        try:
            deps = apps_v1.list_deployment_for_all_namespaces(timeout_seconds=5)
            for d in deps.items:
                available = d.status.available_replicas or 0
                desired = d.spec.replicas or 0
                unavailable = d.status.unavailable_replicas or 0
                data["deployments"].append({
                    "name": d.metadata.name,
                    "namespace": d.metadata.namespace,
                    "desired_replicas": desired,
                    "available_replicas": available,
                    "unavailable_replicas": unavailable,
                    "labels": d.metadata.labels,
                    "images": [c.image for c in d.spec.template.spec.containers] if d.spec.template.spec.containers else []
                })
                if unavailable > 0:
                    data["risks"].append({
                        "severity": "high", "type": "DeploymentUnavailable", "resource": f"deployment/{d.metadata.name}",
                        "namespace": d.metadata.namespace, "evidence": f"{unavailable} replicas unavailable",
                        "recommendation": "Check backing pods for CrashLoopBackOff or Pending states."
                    })
            data["summary"]["deployments"] = len(data["deployments"])
        except Exception:
            pass
            
        # Services
        try:
            svcs = core_v1.list_service_for_all_namespaces(timeout_seconds=5)
            data["summary"]["services"] = len(svcs.items)
            for s in svcs.items:
                data["services"].append({
                    "name": s.metadata.name,
                    "namespace": s.metadata.namespace,
                    "type": s.spec.type,
                    "cluster_ip": s.spec.cluster_ip
                })
        except Exception:
            pass

        # Events
        try:
            events = core_v1.list_event_for_all_namespaces(timeout_seconds=5)
            warning_events = [e for e in events.items if e.type == "Warning"]
            # Sort by last timestamp descending, take last 50
            warning_events.sort(key=lambda x: x.last_timestamp if x.last_timestamp else x.metadata.creation_timestamp, reverse=True)
            for e in warning_events[:50]:
                data["events"].append({
                    "namespace": e.metadata.namespace,
                    "involved_object": f"{e.involved_object.kind}/{e.involved_object.name}",
                    "reason": e.reason,
                    "message": e.message,
                    "count": e.count,
                    "last_timestamp": e.last_timestamp.isoformat() if e.last_timestamp else None
                })
                data["risks"].append({
                    "severity": "medium", "type": "WarningEvent", "resource": f"{e.involved_object.kind}/{e.involved_object.name}",
                    "namespace": e.metadata.namespace, "evidence": f"[{e.reason}] {e.message}",
                    "recommendation": "Review event details to determine if action is required."
                })
            data["summary"]["warning_events"] = len(data["events"])
        except Exception:
            pass

        return data
        
    except yaml.YAMLError:
        return _generate_k8s_error("unknown", "Failed to parse kubeconfig YAML.", "Check if kubeconfig is corrupted.")
    except Exception as e:
        return _generate_k8s_error("unknown", str(e), "Check backend logs for more details.")

def _generate_k8s_error(reason, message, action):
    return {
        "enabled": False,
        "connection_status": "failed",
        "reason": reason,
        "message": message,
        "recommended_action": action
    }
