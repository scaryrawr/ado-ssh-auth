# Port Monitor

This service monitors ports being bound and unbound on a system and communicates this information back via JSON over stdio.

## Usage

The port monitor service is designed to be run on remote machines and communicate back to the client via stdio.

```bash
node path/to/port-monitor
```

## Message Format

The port monitor communicates using JSON messages over stdio. Messages have the following format:

```json
{
  "type": "port",
  "action": "bound" | "unbound",
  "port": 3000,
  "protocol": "tcp" | "udp",
  "timestamp": "2025-05-12T12:00:00.000Z"
}
```

You can parse these messages using tools like `jq` or PowerShell's JSON handling capabilities.
