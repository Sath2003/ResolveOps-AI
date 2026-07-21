from typing import List, Dict

class AWSArchitectureDiagramService:
    @staticmethod
    def generate_mermaid_diagram(resources: List[Dict]) -> str:
        """
        Generates a Mermaid JS architecture diagram from a list of discovered resources.
        Only uses discovered resources, preventing hallucinations.
        """
        if not resources:
            return "graph TD\n  Empty[No AWS Resources Discovered]"
            
        diagram = ["graph TD"]
        
        # Group by Region then VPC
        regions = set(r.get('region', 'us-east-1') for r in resources)
        
        for idx, region in enumerate(regions):
            diagram.append(f"  subgraph Region_{idx}[\"Region: {region}\"]")
            
            # Find VPCs in this region
            vpcs = [r for r in resources if r.get('resource_type') == 'AWS::EC2::VPC' and r.get('region') == region]
            
            for vpc in vpcs:
                vpc_id = vpc['id'].split('/')[-1].replace('-', '_')
                diagram.append(f"    subgraph VPC_{vpc_id}[\"VPC: {vpc.get('resource_name')} ({vpc_id})\"]")
                
                # Add instances inside this VPC
                instances = [r for r in resources if r.get('resource_type') == 'AWS::EC2::Instance' and r.get('metadata', {}).get('vpc_id') == vpc['id'].split('/')[-1]]
                for inst in instances:
                    inst_id = inst['id'].split('/')[-1].replace('-', '_')
                    diagram.append(f"      EC2_{inst_id}[fa:fa-server EC2: {inst.get('resource_name')}]")
                
                # Add RDS inside this VPC (Approximation for prototype)
                rds_dbs = [r for r in resources if r.get('resource_type') == 'AWS::RDS::DBInstance' and r.get('region') == region]
                for db in rds_dbs:
                    db_id = db['id'].split(':')[-1].replace('-', '_')
                    diagram.append(f"      RDS_{db_id}[(fa:fa-database RDS: {db.get('resource_name')})]")
                
                diagram.append("    end")
                
            # Add standalone resources (S3, EKS clusters)
            s3_buckets = [r for r in resources if r.get('resource_type') == 'AWS::S3::Bucket' and r.get('region') == region]
            for s3 in s3_buckets:
                s3_name = s3['resource_name'].replace('-', '_').replace('.', '_')
                diagram.append(f"    S3_{s3_name}[fa:fa-database S3: {s3['resource_name']}]")
                
            eks_clusters = [r for r in resources if r.get('resource_type') == 'AWS::EKS::Cluster' and r.get('region') == region]
            for eks in eks_clusters:
                eks_name = eks['resource_name'].replace('-', '_')
                diagram.append(f"    EKS_{eks_name}{{fa:fa-cubes EKS: {eks['resource_name']}}}")

            diagram.append("  end")

        return "\n".join(diagram)
