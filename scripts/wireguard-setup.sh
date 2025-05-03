Content-Type: multipart/mixed; boundary="//"
MIME-Version: 1.0
 
--//
Content-Type: text/cloud-config; charset="us-ascii"
MIME-Version: 1.0
Content-Transfer-Encoding: 7bit
Content-Disposition: attachment;
 filename="cloud-config.txt"
 
#cloud-config
cloud_final_modules:
- [scripts-user,always]
--//
Content-Type: text/x-shellscript; charset="us-ascii"
MIME-Version: 1.0
Content-Transfer-Encoding: 7bit
Content-Disposition: attachment; filename="userdata.txt"

#!/bin/bash

# Clean package cache
sudo dnf clean all

# Install required packages
sudo dnf install -y jq awscli qrencode iptables-services wireguard-tools

# Set up iptables
echo "Setting up iptables"
sudo systemctl enable iptables
sudo systemctl start iptables

# Install AWS SSM Agent
sudo dnf install -y amazon-ssm-agent
sudo systemctl enable amazon-ssm-agent
sudo systemctl start amazon-ssm-agent

sudo dnf install -y wireguard-tools

# Check if WireGuard is installed
echo "WireGuard installation status"
modinfo wireguard

# Setup WireGuard directory
sudo mkdir -p /etc/wireguard
sudo cd /etc/wireguard
umask 077

SERVER_PRIVATE_KEY="__SERVER_PRIVATE_KEY__"
SERVER_PUBLIC_KEY="__SERVER_PUBLIC_KEY__"
CLIENT_PRIVATE_KEY="__CLIENT_PRIVATE_KEY__"
CLIENT_PUBLIC_KEY="__CLIENT_PUBLIC_KEY__"

# Get the Malware Protection DNS server IP directly from infrastructure
MALWARE_DNS_IP="__MALWARE_PROTECTION_DNS_IP__"

# Use the malware protection server's IP if available, otherwise default to Google DNS
if [ -n "$MALWARE_DNS_IP" ] && [ "$MALWARE_DNS_IP" != "__MALWARE_PROTECTION_DNS_IP__" ]; then
  echo "Using Malware Protection DNS Server at $MALWARE_DNS_IP"
  CLIENT_DNS="$MALWARE_DNS_IP"
else
  echo "No Malware Protection DNS Server configured, using Google DNS"
  CLIENT_DNS="8.8.8.8"
fi

# Enable the WireGuard service
sudo systemctl enable wg-quick@wg0

# Create server configuration file
cat > /etc/wireguard/wg0.conf << EOF
[Interface]
PrivateKey = $SERVER_PRIVATE_KEY
Address = 10.20.10.1/24
ListenPort = 51820
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

[Peer]
PublicKey = $CLIENT_PUBLIC_KEY
AllowedIPs = 10.20.10.2/32
EOF

# Start the WireGuard service
sudo systemctl start wg-quick@wg0

ENDPOINT="__FULL_DOMAIN_NAME__:51820"

# Create client configuration file
cat > /etc/wireguard/client.conf << EOF
[Interface]
PrivateKey = $CLIENT_PRIVATE_KEY
Address = 10.20.10.2/24
DNS = 8.8.8.8

[Peer]
PublicKey = $SERVER_PUBLIC_KEY
Endpoint = $ENDPOINT
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
EOF

# Enable IP forwarding permanently
echo "net.ipv4.ip_forward=1" > /etc/sysctl.d/99-wireguard.conf
sysctl -p /etc/sysctl.d/99-wireguard.conf

# Final message and QR code

echo "WireGuard VPN server setup complete!"
echo "Scan this QR code with your WireGuard mobile app:"
qrencode -t ANSIUTF8 < /etc/wireguard/client.conf

echo "\nTo retrieve your config, use AWS SSM Session Manager to access the file securely."
echo "You can also copy the config from /etc/wireguard/client.conf if needed."

# Install Python if not already present (should be on AL2023 by default)
sudo dnf install -y python3

# Create a minimal health check server script
cat > /usr/local/bin/healthcheck-server.py << EOF
import http.server
import socketserver

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'OK')

if __name__ == '__main__':
    with socketserver.TCPServer(('', 80), Handler) as httpd:
        httpd.serve_forever()
EOF

# Run the health check server in the background
nohup python3 /usr/local/bin/healthcheck-server.py &>/dev/null &
