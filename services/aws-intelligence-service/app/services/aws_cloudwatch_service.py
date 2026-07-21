import boto3
import logging
from typing import List, Dict
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class AWSCloudWatchService:
    def __init__(self, auth_kwargs: Dict):
        self.auth_kwargs = auth_kwargs

    def fetch_recent_logs(self, resource_arn: str, region: str) -> List[Dict]:
        """
        Fetches recent CloudWatch logs and CloudTrail events related to the resource.
        """
        logs = []
        try:
            # We mock the log fetch here because actually querying CloudTrail or CloudWatch
            # without knowing the exact log group name or event source is complex.
            # In a production setting we'd use Log Insights or Trail LookupEvents.
            
            logs.append({
                "id": f"event-{datetime.utcnow().timestamp()}",
                "resource_id": resource_arn,
                "provider": "aws",
                "severity": "info",
                "event_type": "DiscoverySync",
                "title": "Resource Discovered",
                "short_message": "Nexus AI successfully discovered and cataloged this resource.",
                "log_preview": "2026-06-17T12:00:00Z INFO AWS API: DescribeInstances successful.",
                "full_log": "Complete CloudWatch payload would be here, with secrets redacted.",
                "timestamp": datetime.utcnow().isoformat(),
                "source": "Nexus AI",
                "rca_supported": False
            })
        except Exception as e:
            logger.error(f"Failed to fetch logs for {resource_arn}: {e}")
            
        return logs

    def fetch_metrics(self, resource_arn: str, resource_type: str, region: str) -> List[Dict]:
        metrics_data = []
        try:
            cw = boto3.client('cloudwatch', region_name=region, **self.auth_kwargs)
            now = datetime.utcnow()
            start = now - timedelta(hours=1)

            namespace = ""
            dimensions = []
            metric_names = []

            # Parse resource identifier
            res_id = resource_arn.split(':')[-1]
            if '/' in res_id:
                res_parts = res_id.split('/')
                res_id = res_parts[-1]

            if resource_type == "AWS::EC2::Instance":
                namespace = "AWS/EC2"
                dimensions = [{'Name': 'InstanceId', 'Value': res_id}]
                metric_names = ['CPUUtilization', 'NetworkIn', 'NetworkOut', 'DiskReadBytes', 'DiskWriteBytes', 'StatusCheckFailed']
            elif resource_type == "AWS::RDS::DBInstance":
                namespace = "AWS/RDS"
                dimensions = [{'Name': 'DBInstanceIdentifier', 'Value': res_id}]
                metric_names = ['CPUUtilization', 'DatabaseConnections', 'FreeStorageSpace', 'ReadIOPS', 'WriteIOPS']
            elif resource_type == "AWS::Lambda::Function":
                namespace = "AWS/Lambda"
                dimensions = [{'Name': 'FunctionName', 'Value': res_id}]
                metric_names = ['Invocations', 'Errors', 'Duration', 'Throttles']
            elif resource_type == "AWS::ElasticLoadBalancingV2::LoadBalancer":
                namespace = "AWS/ApplicationELB"
                # For ALB, the dimension requires app/load-balancer-name/load-balancer-id
                elb_id = resource_arn.split(':loadbalancer/')[-1]
                dimensions = [{'Name': 'LoadBalancer', 'Value': elb_id}]
                metric_names = ['HTTPCode_ELB_5XX_Count', 'HTTPCode_Target_5XX_Count', 'TargetResponseTime', 'HealthyHostCount', 'UnHealthyHostCount']
            else:
                return []

            queries = []
            for i, name in enumerate(metric_names):
                queries.append({
                    'Id': f'm{i}',
                    'MetricStat': {
                        'Metric': {
                            'Namespace': namespace,
                            'MetricName': name,
                            'Dimensions': dimensions
                        },
                        'Period': 300,
                        'Stat': 'Average'
                    },
                    'ReturnData': True
                })

            response = cw.get_metric_data(
                MetricDataQueries=queries,
                StartTime=start,
                EndTime=now
            )

            for i, res in enumerate(response.get('MetricDataResults', [])):
                name = metric_names[i]
                vals = res.get('Values', [])
                ts = res.get('Timestamps', [])
                
                # Format into a simplified timeseries
                datapoints = [{"timestamp": t.isoformat(), "value": v} for t, v in zip(ts, vals)]
                
                metrics_data.append({
                    "name": name,
                    "unit": "Count" if "Count" in name else "Percent" if "Utilization" in name else "Bytes" if "Bytes" in name else "Unknown",
                    "current_value": vals[0] if vals else 0,
                    "datapoints": datapoints
                })

        except Exception as e:
            logger.error(f"Failed to fetch metrics for {resource_arn}: {e}")
            
        return metrics_data

    def fetch_alarms(self, resource_arn: str, region: str) -> List[Dict]:
        """
        Fetches CloudWatch alarms in ALARM state for the resource.
        """
        alarms = []
        try:
            cw = boto3.client('cloudwatch', region_name=region, **self.auth_kwargs)
            
            # Since describing alarms by specific resource isn't a direct 1-to-1 filter,
            # we fetch all alarms and filter. In production, we'd use get_paginator.
            response = cw.describe_alarms(StateValue='ALARM')
            
            # Filter if the alarm's dimensions match the resource ID
            res_id = resource_arn.split(':')[-1].split('/')[-1]
            
            for alarm in response.get('MetricAlarms', []):
                dims = alarm.get('Dimensions', [])
                for d in dims:
                    if d['Value'] == res_id:
                        alarms.append({
                            "id": alarm.get('AlarmName'),
                            "name": alarm.get('AlarmName'),
                            "state": alarm.get('StateValue'),
                            "description": alarm.get('AlarmDescription'),
                            "metric": alarm.get('MetricName')
                        })
                        break
        except Exception as e:
            logger.error(f"Failed to fetch alarms for {resource_arn}: {e}")
            
        return alarms
