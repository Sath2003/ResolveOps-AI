import boto3
import logging
from typing import Dict, List, Any
import datetime
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

class AWSSubResourceService:
    def __init__(self, auth_kwargs: Dict):
        self.auth_kwargs = auth_kwargs

    def _get_client(self, service_name: str, region: str):
        kwargs = self.auth_kwargs.copy()
        if region and region != "global":
            kwargs['region_name'] = region
        return boto3.client(service_name, **kwargs)

    def get_subresources(self, resource_type: str, resource_id: str, resource_name: str, region: str) -> Dict:
        """
        Fetches sub-resources for a given AWS resource based on its type.
        Returns a structured dictionary with partial_success pattern.
        """
        result = {
            "status": "success",
            "warnings": [],
            "subresources": {}
        }
        
        try:
            if "EC2" in resource_type and "Instance" in resource_type:
                result["subresources"] = self._get_ec2_subresources(resource_id, region, result["warnings"])
            elif "EKS" in resource_type:
                result["subresources"] = self._get_eks_subresources(resource_name, region, result["warnings"])
            elif "RDS" in resource_type:
                result["subresources"] = self._get_rds_subresources(resource_name, region, result["warnings"])
            elif "S3" in resource_type:
                result["subresources"] = self._get_s3_subresources(resource_name, region, result["warnings"])
            elif "LoadBalancer" in resource_type:
                # LoadBalancers use their full ARN as resource_id typically, but the API may expect the ARN
                result["subresources"] = self._get_elb_subresources(resource_id, region, result["warnings"])
            elif "Lambda" in resource_type:
                result["subresources"] = self._get_lambda_subresources(resource_name, region, result["warnings"])
            else:
                result["subresources"] = {}
                result["warnings"].append(f"Sub-resource discovery not implemented for {resource_type}")
                result["status"] = "partial_success"

        except Exception as e:
            logger.error(f"Error fetching subresources for {resource_type} {resource_id}: {e}")
            result["status"] = "partial_success"
            result["warnings"].append(f"Sub-resource discovery is partially available. Some AWS permissions may be missing. ({str(e)})")

        if result["warnings"] and result["status"] == "success":
            result["status"] = "partial_success"

        return result

    def _get_ec2_subresources(self, instance_id: str, region: str, warnings: List[str]) -> Dict:
        subresources = {"volumes": [], "network_interfaces": []}
        try:
            ec2 = self._get_client('ec2', region)
            # Volumes
            try:
                vols = ec2.describe_volumes(Filters=[{'Name': 'attachment.instance-id', 'Values': [instance_id]}])
                for v in vols.get('Volumes', []):
                    subresources["volumes"].append({
                        "id": v.get("VolumeId"),
                        "type": v.get("VolumeType"),
                        "size": f"{v.get('Size')} GB",
                        "state": v.get("State"),
                        "encrypted": v.get("Encrypted")
                    })
            except ClientError as e:
                warnings.append(f"Failed to fetch volumes: {str(e)}")

            # ENIs
            try:
                enis = ec2.describe_network_interfaces(Filters=[{'Name': 'attachment.instance-id', 'Values': [instance_id]}])
                for eni in enis.get('NetworkInterfaces', []):
                    subresources["network_interfaces"].append({
                        "id": eni.get("NetworkInterfaceId"),
                        "private_ip": eni.get("PrivateIpAddress"),
                        "public_ip": eni.get("Association", {}).get("PublicIp", "None"),
                        "status": eni.get("Status"),
                        "mac_address": eni.get("MacAddress")
                    })
            except ClientError as e:
                warnings.append(f"Failed to fetch network interfaces: {str(e)}")

        except Exception as e:
            warnings.append(f"EC2 subresource error: {str(e)}")
            
        return subresources

    def _get_eks_subresources(self, cluster_name: str, region: str, warnings: List[str]) -> Dict:
        subresources = {"node_groups": [], "kubernetes_workloads": {}}
        try:
            eks = self._get_client('eks', region)
            try:
                ngs = eks.list_nodegroups(clusterName=cluster_name)
                for ng_name in ngs.get("nodegroups", []):
                    ng_desc = eks.describe_nodegroup(clusterName=cluster_name, nodegroupName=ng_name).get("nodegroup", {})
                    subresources["node_groups"].append({
                        "name": ng_name,
                        "status": ng_desc.get("status"),
                        "instance_types": ng_desc.get("instanceTypes", []),
                        "scaling_config": ng_desc.get("scalingConfig", {})
                    })
            except ClientError as e:
                warnings.append(f"Failed to fetch Node Groups: {str(e)}")

            # Kubernetes Workloads via EKS Visibility Service (mocked for now as requested)
            from app.services.aws_eks_visibility_service import AWSEKSVisibilityService
            vis = AWSEKSVisibilityService(self.auth_kwargs)
            k8s = vis.get_cluster_workloads(cluster_name, region)
            if k8s.get("status") != "success":
                # Ensure the exact fallback message requested by user
                warnings.append("EKS cluster was discovered, but Kubernetes workload access is not configured.")
            else:
                subresources["kubernetes_workloads"] = k8s.get("workloads", {})

        except Exception as e:
            warnings.append(f"EKS subresource error: {str(e)}")
            
        return subresources

    def _get_rds_subresources(self, db_id: str, region: str, warnings: List[str]) -> Dict:
        subresources = {"snapshots": [], "subnet_group": None, "parameter_groups": []}
        try:
            rds = self._get_client('rds', region)
            # Instance Details (for subnet groups/param groups)
            try:
                instances = rds.describe_db_instances(DBInstanceIdentifier=db_id).get('DBInstances', [])
                if instances:
                    instance = instances[0]
                    subresources["subnet_group"] = instance.get("DBSubnetGroup", {}).get("DBSubnetGroupName")
                    subresources["parameter_groups"] = [p.get("DBParameterGroupName") for p in instance.get("DBParameterGroups", [])]
            except ClientError as e:
                warnings.append(f"Failed to describe DB Instance: {str(e)}")

            # Snapshots
            try:
                snaps = rds.describe_db_snapshots(DBInstanceIdentifier=db_id).get("DBSnapshots", [])
                for snap in snaps:
                    subresources["snapshots"].append({
                        "id": snap.get("DBSnapshotIdentifier"),
                        "status": snap.get("Status"),
                        "type": snap.get("SnapshotType"),
                        "created": snap.get("SnapshotCreateTime").isoformat() if snap.get("SnapshotCreateTime") else None
                    })
            except ClientError as e:
                warnings.append(f"Failed to fetch RDS snapshots: {str(e)}")

        except Exception as e:
            warnings.append(f"RDS subresource error: {str(e)}")
            
        return subresources

    def _get_s3_subresources(self, bucket_name: str, region: str, warnings: List[str]) -> Dict:
        subresources = {"lifecycle_rules": [], "objects_summary": {}}
        try:
            s3 = self._get_client('s3', region)
            
            try:
                lc = s3.get_bucket_lifecycle_configuration(Bucket=bucket_name)
                for rule in lc.get("Rules", []):
                    subresources["lifecycle_rules"].append({
                        "id": rule.get("ID"),
                        "status": rule.get("Status")
                    })
            except ClientError as e:
                if e.response['Error']['Code'] != 'NoSuchLifecycleConfiguration':
                    warnings.append(f"Failed to fetch lifecycle rules: {str(e)}")

            try:
                # Get object count and size (limited to 1000 for safety, just a summary)
                objs = s3.list_objects_v2(Bucket=bucket_name, MaxKeys=1000)
                count = objs.get("KeyCount", 0)
                total_size = sum([obj.get("Size", 0) for obj in objs.get("Contents", [])])
                is_truncated = objs.get("IsTruncated", False)
                subresources["objects_summary"] = {
                    "count": f"{count}{'+' if is_truncated else ''}",
                    "total_size_bytes": total_size
                }
            except ClientError as e:
                warnings.append(f"Failed to fetch objects summary: {str(e)}")

        except Exception as e:
            warnings.append(f"S3 subresource error: {str(e)}")
            
        return subresources

    def _get_elb_subresources(self, lb_arn: str, region: str, warnings: List[str]) -> Dict:
        subresources = {"listeners": [], "target_groups": []}
        try:
            elb = self._get_client('elbv2', region)
            
            try:
                listeners = elb.describe_listeners(LoadBalancerArn=lb_arn).get("Listeners", [])
                for l in listeners:
                    subresources["listeners"].append({
                        "arn": l.get("ListenerArn"),
                        "port": l.get("Port"),
                        "protocol": l.get("Protocol")
                    })
            except ClientError as e:
                warnings.append(f"Failed to fetch listeners: {str(e)}")

            try:
                tgs = elb.describe_target_groups(LoadBalancerArn=lb_arn).get("TargetGroups", [])
                for tg in tgs:
                    tg_info = {
                        "arn": tg.get("TargetGroupArn"),
                        "name": tg.get("TargetGroupName"),
                        "protocol": tg.get("Protocol"),
                        "port": tg.get("Port"),
                        "targets": []
                    }
                    
                    try:
                        health = elb.describe_target_health(TargetGroupArn=tg.get("TargetGroupArn")).get("TargetHealthDescriptions", [])
                        for th in health:
                            tg_info["targets"].append({
                                "id": th.get("Target", {}).get("Id"),
                                "port": th.get("Target", {}).get("Port"),
                                "state": th.get("TargetHealth", {}).get("State"),
                                "reason": th.get("TargetHealth", {}).get("Reason")
                            })
                    except ClientError as e:
                        warnings.append(f"Failed to fetch target health for {tg.get('TargetGroupName')}: {str(e)}")
                        
                    subresources["target_groups"].append(tg_info)
            except ClientError as e:
                warnings.append(f"Failed to fetch target groups: {str(e)}")

        except Exception as e:
            warnings.append(f"ELB subresource error: {str(e)}")
            
        return subresources

    def _get_lambda_subresources(self, function_name: str, region: str, warnings: List[str]) -> Dict:
        subresources = {"environment_keys": [], "event_sources": []}
        try:
            lmd = self._get_client('lambda', region)
            
            try:
                conf = lmd.get_function_configuration(FunctionName=function_name)
                env = conf.get("Environment", {}).get("Variables", {})
                # DO NOT EXPOSE VALUES, ONLY KEYS!
                subresources["environment_keys"] = list(env.keys())
            except ClientError as e:
                warnings.append(f"Failed to fetch function configuration: {str(e)}")

            try:
                sources = lmd.list_event_source_mappings(FunctionName=function_name).get("EventSourceMappings", [])
                for src in sources:
                    subresources["event_sources"].append({
                        "id": src.get("UUID"),
                        "arn": src.get("EventSourceArn"),
                        "state": src.get("State")
                    })
            except ClientError as e:
                warnings.append(f"Failed to fetch event source mappings: {str(e)}")

        except Exception as e:
            warnings.append(f"Lambda subresource error: {str(e)}")
            
        return subresources
