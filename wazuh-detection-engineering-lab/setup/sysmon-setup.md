# Sysmon Setup

## Overview

Sysmon is used to provide detailed Windows endpoint telemetry.

It records security-relevant system activity in the Windows Event Log, which is then collected by the Wazuh agent.

The telemetry pipeline is:

```text
Windows Activity
      ↓
Sysmon
      ↓
Microsoft-Windows-Sysmon/Operational
      ↓
Wazuh Agent
      ↓
Wazuh Manager
      ↓
Detection Rules
```

## Sysmon Installation

FLARE-VM already contained the Sysmon binaries:

```text
C:\Tools\sysinternals\Sysmon.exe
C:\Tools\sysinternals\Sysmon64.exe
```

The installed binary version was:

```text
15.15
```

## Sysmon Configuration

The SwiftOnSecurity Sysmon configuration was used as the starting configuration for endpoint telemetry.

Configuration file:

```text
sysmonconfig-export.xml
```

The configuration was placed at:

```text
C:\Tools\sysinternals\sysmonconfig-export.xml
```

## Install Sysmon

From Administrator PowerShell:

```powershell
cd C:\Tools\sysinternals

.\Sysmon64.exe -accepteula -i .\sysmonconfig-export.xml
```

Verify the service:

```powershell
Get-Service Sysmon*
```

The Sysmon service should report:

```text
Running
```

## Sysmon Event Log

Sysmon writes its events to:

```text
Microsoft-Windows-Sysmon/Operational
```

Recent events can be inspected using:

```powershell
Get-WinEvent `
  -LogName "Microsoft-Windows-Sysmon/Operational" `
  -MaxEvents 10 |
Select-Object TimeCreated, Id, Message
```

Examples of observed events include:

| Event ID | Description |
|---|---|
| 1 | Process creation |
| 22 | DNS query |

## Configure Wazuh to Collect Sysmon

The Wazuh agent configuration was modified:

```text
C:\Program Files (x86)\ossec-agent\ossec.conf
```

The following event channel was added:

```xml
<localfile>
  <location>Microsoft-Windows-Sysmon/Operational</location>
  <log_format>eventchannel</log_format>
</localfile>
```

The Wazuh agent was then restarted:

```powershell
Restart-Service WazuhSvc
```

Verify:

```powershell
Get-Service WazuhSvc
```

## Verify Sysmon → Wazuh

A test process was generated on the Windows endpoint.

Sysmon recorded the process as:

```text
Event ID 1 - Process Create
```

Wazuh Threat Hunting was filtered using:

```text
data.win.system.eventID = 1
agent.name = WIN10-FLARE
```

Sysmon Process Creation events appeared successfully.

Inspection of an event showed fields including:

```text
data.win.system.providerName
data.win.system.eventID
data.win.eventdata.image
data.win.eventdata.commandLine
data.win.eventdata.parentImage
data.win.eventdata.processId
data.win.eventdata.hashes
```

The provider was:

```text
Microsoft-Windows-Sysmon
```

This confirmed that Sysmon telemetry was successfully reaching Wazuh.

## Detection Validation

Account discovery was generated using:

```powershell
net user
```

Sysmon generated a Process Creation event.

Wazuh subsequently generated detections including:

```text
Rule 92031
Discovery activity executed
```

and:

```text
Rule 92033
Discovery activity spawned via powershell execution
```

The activity was mapped to:

```text
MITRE ATT&CK T1087 - Account Discovery
```

## Result

The complete telemetry pipeline was successfully validated:

```text
Process Execution
       ↓
Sysmon Event ID 1
       ↓
Windows Event Log
       ↓
Wazuh Agent
       ↓
Wazuh Manager
       ↓
Detection Rule
       ↓
MITRE ATT&CK
       ↓
Threat Hunting
```

Sysmon now serves as the primary source of detailed Windows endpoint telemetry for subsequent detection-engineering exercises.