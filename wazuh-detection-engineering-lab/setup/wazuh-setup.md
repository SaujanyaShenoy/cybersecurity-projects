# Wazuh Setup

## Overview

Wazuh acts as the SIEM and detection engine for this lab.

The deployment uses an all-in-one Wazuh installation containing:

- Wazuh Manager
- Wazuh Indexer
- Wazuh Dashboard

The server runs on Ubuntu 22.04.

## Installation

The Wazuh installation script was downloaded using:

```bash
curl -sO https://packages.wazuh.com/4.14/wazuh-install.sh
```

The all-in-one installation was then performed with:

```bash
sudo bash ./wazuh-install.sh -a
```

## Verify Wazuh Services

The primary Wazuh services can be checked using:

```bash
sudo systemctl status wazuh-manager
sudo systemctl status wazuh-indexer
sudo systemctl status wazuh-dashboard
```

All three services should report:

```text
Active: active (running)
```

## Windows Agent

The Wazuh agent was installed on the Windows 10 FLARE-VM endpoint.

Default installation directory:

```text
C:\Program Files (x86)\ossec-agent
```

The agent was enrolled with the Wazuh manager using:

```powershell
cd "C:\Program Files (x86)\ossec-agent"

.\agent-auth.exe -m 172.x.x.x -A WIN10-FLARE
```

Where:

- `172.x.x.x` = Wazuh manager host-only address
- `WIN10-FLARE` = agent name

## Agent Configuration

The Wazuh agent configuration is stored at:

```text
C:\Program Files (x86)\ossec-agent\ossec.conf
```

The manager address was configured as:

```xml
<client>
  <server>
    <address>172.x.x.x</address>
    <port>1514</port>
    <protocol>tcp</protocol>
  </server>
</client>
```

## Start the Agent

From Administrator PowerShell:

```powershell
Start-Service WazuhSvc
```

Verify:

```powershell
Get-Service WazuhSvc
```

Expected state:

```text
Running
```

## Connectivity Verification

Connectivity from the Windows endpoint to the Wazuh manager can be tested with:

```powershell
Test-NetConnection 172.x.x.x -Port 1514
```

A successful connection should report:

```text
TcpTestSucceeded : True
```

## Agent Verification

After enrollment, the Wazuh dashboard showed:

```text
Agent: WIN10-FLARE
Status: Active
IP: 172.x.x.x
```

This confirms that the Windows endpoint is successfully communicating with the Wazuh manager.

## Custom Detection Rules

Custom Wazuh rules are stored in:

```text
/var/ossec/etc/rules/local_rules.xml
```

Before modifying the rules, a backup was created:

```bash
sudo cp /var/ossec/etc/rules/local_rules.xml \
/var/ossec/etc/rules/local_rules.xml.bak
```

Rules can be validated before deployment using:

```bash
sudo /var/ossec/bin/wazuh-logtest
```

After adding or modifying a rule, the manager can be restarted:

```bash
sudo systemctl restart wazuh-manager
```

Verify:

```bash
sudo systemctl status wazuh-manager --no-pager
```

## Result

The Wazuh manager successfully:

- Receives Windows endpoint telemetry
- Processes Sysmon events
- Applies built-in Wazuh detection rules
- Executes custom detection rules
- Maps detections to MITRE ATT&CK
- Displays alerts through Threat Hunting