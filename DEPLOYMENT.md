# Deployment Guide: ResolveOps AI on AWS

This guide walks you through manually deploying the ResolveOps AI application on a single AWS EC2 instance and configuring it to be served securely over HTTPS under the domain `resolvesops-ai.sathvikdevops.site` (with `resolveops-ai.sathvikdevops.site` as a secondary domain) using the GoDaddy DNS manager.

---

## Step 1: Provision AWS Resources (AWS Console)

### 1. Launch EC2 Instance
1. Open the **AWS EC2 Console**.
2. Click **Launch Instance**.
3. **Name**: `resolveops-ai-prod`
4. **OS Image (AMI)**: Choose **Ubuntu Server 22.04 LTS** (or Amazon Linux 2023).
5. **Instance Type**: Select **`t3.large`** (2 vCPUs, 8 GB RAM). 
   * *Note: The application runs 8 Docker containers simultaneously, so `t3.large` or larger is required to prevent out-of-memory errors.*
6. **Key Pair**: Select or create a key pair for SSH access.
7. **Network Settings**:
   * Allow SSH traffic from your IP.
   * Allow HTTP traffic (Port 80) from the Internet (0.0.0.0/0).
   * Allow HTTPS traffic (Port 443) from the Internet (0.0.0.0/0).
8. Click **Launch Instance**.

### 2. Allocate & Associate an Elastic IP
1. In the EC2 Console left sidebar, go to **Network & Security** -> **Elastic IPs**.
2. Click **Allocate Elastic IP address** and click **Allocate**.
3. Select the allocated Elastic IP, click **Actions** -> **Associate Elastic IP address**.
4. Choose your running `resolveops-ai-prod` instance and click **Associate**.
5. **Note down this Public Elastic IP address** (e.g., `54.210.12.34`).

---

## Step 2: Configure DNS in GoDaddy

1. Log in to your **GoDaddy Control Panel**.
2. Go to **My Products** -> Click **Manage** next to **`sathvikdevops.site`**.
3. Under the **DNS** tab, click **DNS Templates** or **Add Record** directly under the DNS Records table.
4. Add a new **`A` record**:
   * **Type**: `A`
   * **Name**: `resolvesops-ai` (this creates `resolvesops-ai.sathvikdevops.site`)
   * **Value**: *Your EC2 Elastic IP address* (e.g., `54.210.12.34`)
   * **TTL**: `1 Hour` (or `Custom` -> `600 seconds` for faster propagation)
5. *(Optional)* Add a secondary **`A` record** if you also want to support the alternative spelling:
   * **Type**: `A`
   * **Name**: `resolveops-ai` (this creates `resolveops-ai.sathvikdevops.site`)
   * **Value**: *Your EC2 Elastic IP address*
   * **TTL**: `1 Hour`
6. Save the records and wait a few minutes for the DNS settings to propagate globally.

---

## Step 3: Install Docker & Setup the Server

SSH into your EC2 instance:
```bash
ssh -i "your-key.pem" ubuntu@<your-elastic-ip>
```

### 1. Install Docker & Docker Compose
Run the following commands to install Docker and Docker Compose on Ubuntu:
```bash
# Update local packages
sudo apt-get update -y

# Install Docker
sudo apt-get install -y docker.io

# Start and enable Docker service
sudo systemctl start docker
sudo systemctl enable docker

# Add user 'ubuntu' to the docker group so you don't need 'sudo' prefix for docker commands
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Log out and log back in for docker groups to take effect:
exit
```

Log back in:
```bash
ssh -i "your-key.pem" ubuntu@<your-elastic-ip>
```
Verify installations:
```bash
docker --version
docker-compose --version
```

---

## Step 4: Clone & Run the Application

### 1. Clone the Repository
```bash
git clone https://github.com/<your-username>/ResolveOps-AI.git
cd ResolveOps-AI
```

### 2. Configure Environment Variables
Copy the example env file and update production secrets:
```bash
cp .env.example .env
nano .env
```
Ensure you update the following in `.env`:
* `APP_ENV=prod`
* `JWT_SECRET` (generate a secure random string)
* `DB_PASSWORD` (use a strong password instead of `local-db-pass`)
* `DATABASE_URL` (update password matching `DB_PASSWORD`)
* `AI_PROVIDER=openai` (tells the microservices to use OpenAI instead of AWS Bedrock)
* `OPENAI_API_KEY` (your direct OpenAI API key starting with `sk-...`)
* `OPENAI_MODEL_NAME=gpt-4o-mini` (or your preferred OpenAI model)
* Any AWS or GitHub API keys required for your integrations.

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X`).

### 3. Launch the Application with Caddy Reverse Proxy
Run the production compose file in detached mode:
```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

---

## Step 5: Verification & Logs

### Check Running Containers
```bash
docker-compose -f docker-compose.prod.yml ps
```
You should see all containers (including `resolveops-postgres` and `resolveops-proxy`) running.

### Monitor Caddy TLS/SSL Logs
To verify that Caddy has successfully obtained the SSL certificate for your domains:
```bash
docker logs -f resolveops-proxy
```
You should see logs indicating a successful ACME challenge and certificate acquisition from Let's Encrypt / ZeroSSL.

### Access the Application
Open your web browser and navigate to:
* **`https://resolvesops-ai.sathvikdevops.site`**

You should see the ResolveOps AI frontend loading securely over HTTPS!
