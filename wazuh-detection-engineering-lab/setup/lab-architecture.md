# Lab Architecture

## Overview

This lab provides an isolated environment for practicing Windows detection engineering using Wazuh and Sysmon.

The environment is designed to generate endpoint activity on a Windows system, collect detailed telemetry using Sysmon, forward the events to Wazuh, and develop and validate custom detection rules.

## Architecture

```text
                    VMware Workstation
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   Ubuntu 22.04                    Windows 10 FLARE-VM    │
│   ┌─────────────────┐             ┌──────────────────┐   │
│   │ Wazuh Manager   │             │ Sysmon           │   │
│   │ Wazuh Indexer   │◄────────────│ Wazuh Agent      │   │
│   │ Wazuh Dashboard │  Host-only  │ Security Logs    │   │
│   └─────────────────┘             └──────────────────┘   │
│          │                                │              │
│          └────────── NAT ─────────────────┘              │
│                     Internet                            │
└─────────────────────────────────────────────────────────┘
```

## Virtual Machines

| System | Purpose | Operating System |
|---|---|---|
| Wazuh Server | SIEM, log analysis, detection rules | Ubuntu 22.04 |
| WIN10-FLARE | Monitored endpoint | Windows 10 / FLARE-VM |
| Kali Linux | Future adversary simulation | Kali Linux |

## Network Design

Two VMware network adapters are used.

### NAT

Used only when Internet connectivity is required, such as downloading packages and tools.

### Host-only

Used for communication between systems inside the security lab.

Current lab addressing:

| System | Interface | IP |
|---|---|---|
| Wazuh Server | Host-only | `172.x.x.x` |
| WIN10-FLARE | Host-only | `172.x.x.x` |
| Wazuh Server | NAT | `10.10.0.x` |
| WIN10-FLARE | NAT | `10.10.0.x` |

Using a host-only network for lab traffic helps keep security testing traffic separate from the external network.

## Detection Pipeline

```text
Windows Activity
       │
       ▼
     Sysmon
       │
       │ Windows Event Log
       ▼
   Wazuh Agent
       │
       │ TCP 1514
       ▼
  Wazuh Manager
       │
       ▼
 Detection Rules
       │
       ▼
 MITRE ATT&CK Mapping
       │
       ▼
 Wazuh Threat Hunting
```

## Current Components

- Wazuh 4.14.7
- Windows 10 FLARE-VM
- Sysmon 15.15
- SwiftOnSecurity Sysmon configuration
- VMware Workstation
- Custom Wazuh detection rules

## Lab Goals

The lab is used to practice:

- Endpoint telemetry collection
- Windows event analysis
- Sysmon analysis
- Detection engineering
- Custom Wazuh rule development
- MITRE ATT&CK mapping
- Alert validation
- False-positive analysis and tuning
- Controlled adversary simulation

## Safety

Attack simulations are performed only against systems inside the dedicated lab environment.

Host-only networking is used for internal lab communication, while NAT is used when Internet access is required.