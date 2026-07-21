import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

class AWSEventTriggerService:
    @staticmethod
    def publish_event(event_name: str, payload: Dict[str, Any]):
        """
        Publishes an AWS-related event to the internal message bus or RabbitMQ.
        Future architecture will use Azure Service Bus.
        """
        valid_events = [
            "aws_account_connected",
            "aws_resource_scan_started",
            "aws_resource_scan_completed",
            "aws_risk_detected",
            "aws_cost_anomaly_detected",
            "aws_eks_risk_detected",
            "aws_rca_requested",
            "aws_rca_completed",
            "aws_diagram_generation_requested",
            "aws_notification_requested"
        ]
        
        if event_name not in valid_events:
            logger.warning(f"Attempted to publish unknown AWS event: {event_name}")
            return
            
        # In a real implementation, this pushes to RabbitMQ/HTTP Webhook
        logger.info(f"Published Event [{event_name}]: {payload.get('resource_id', 'global')}")
        
    @staticmethod
    def trigger_critical_notification(resource_id: str, risk: Dict):
        """
        Triggers a direct notification (via API Gateway -> notifications.py) for critical risks.
        """
        if risk.get("severity") == "critical":
            logger.info(f"Triggering critical notification for risk on {resource_id}: {risk.get('title')}")
            AWSEventTriggerService.publish_event("aws_notification_requested", {
                "resource_id": resource_id,
                "risk": risk
            })
