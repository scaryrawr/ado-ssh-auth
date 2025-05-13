import { spawn } from "child_process";
import { platform } from "os";
import * as readline from "readline";

// Define types for our messages
interface PortEvent {
  type: "port";
  action: "bound" | "unbound";
  port: number;
  protocol: "tcp" | "udp";
  timestamp: string;
}

interface ErrorEvent {
  type: "error";
  message: string;
  timestamp: string;
}

type MonitorEvent = PortEvent | ErrorEvent;

// Track the currently bound ports
const boundPorts = new Set<string>();

/**
 * Check if a port should be monitored
 * @param port The port number to check
 * @returns True if the port should be monitored, false otherwise
 */
function shouldMonitorPort(port: number): boolean {
  // Filter out well-known ports (0-1023)
  return port > 1023;
}

/**
 * Send a message to stdout in JSON format
 * @param event The event to send
 */
function sendMessage(event: MonitorEvent): void {
  console.log(JSON.stringify(event));
}

/**
 * Get the command to run for the current platform to monitor network connections
 */
function getMonitorCommand(): { cmd: string; args: string[] } {
  const os = platform();

  switch (os) {
    case "win32":
      // On Windows we'll use netstat and parse its output
      return {
        cmd: "powershell",
        args: [
          "-Command",
          "while($true) { netstat -n -a -p TCP; Start-Sleep -Seconds 2 }",
        ],
      };
    case "darwin":
      // On macOS we'll use lsof
      return {
        cmd: "sh",
        args: [
          "-c",
          "while true; do lsof -i -P -n | grep LISTEN; sleep 2; done",
        ],
      };
    case "linux":
      // On Linux we'll use ss
      return {
        cmd: "sh",
        args: ["-c", "while true; do ss -tulpn | grep LISTEN; sleep 2; done"],
      };
    default:
      throw new Error(`Unsupported platform: ${os}`);
  }
}

/**
 * Parse port information from a line of output
 * @param line The line to parse
 * @returns Information about the bound port, or null if parsing failed
 */
function parsePortInfo(
  line: string
): { port: number; protocol: "tcp" | "udp"; key: string } | null {
  const os = platform();

  try {
    if (os === "win32") {
      // Parse Windows netstat output
      // Example: TCP    127.0.0.1:8080    0.0.0.0:0    LISTENING
      const match = line.match(/\s+(TCP|UDP)\s+.+?:(\d+)\s+.*LISTENING/i);
      if (match && match[1] && match[2]) {
        const protocol = match[1].toLowerCase() as "tcp" | "udp";
        const port = parseInt(match[2], 10);
        return { port, protocol, key: `${protocol}:${port}` };
      }
    } else if (os === "darwin") {
      // Parse macOS lsof output
      // Example: node      1234 user   12u  IPv4 0xabcdef      0t0  TCP *:8080 (LISTEN)
      const match = line.match(/.*\s+(TCP|UDP)\s+.*:(\d+)\s+\(LISTEN\)/i);
      if (match && match[1] && match[2]) {
        const protocol = match[1].toLowerCase() as "tcp" | "udp";
        const port = parseInt(match[2], 10);
        return { port, protocol, key: `${protocol}:${port}` };
      }
    } else if (os === "linux") {
      // Parse Linux ss output
      // Example: LISTEN   0   128   *:8080   *:*
      const match = line.match(/LISTEN.*:(\d+)\s/);
      if (match && match[1]) {
        // Assuming TCP for Linux ss output, could be enhanced
        const port = parseInt(match[1], 10);
        return { port, protocol: "tcp", key: `tcp:${port}` };
      }
    }
  } catch {
    // If parsing fails, just ignore the line
    sendMessage({
      type: "error",
      message: `Failed to parse line: ${line}`,
      timestamp: new Date().toISOString(),
    });
  }

  return null;
}

/**
 * Start monitoring for port changes
 */
function startMonitoring(): void {
  try {
    const { cmd, args } = getMonitorCommand();
    const monitor = spawn(cmd, args);

    // Process stdout
    const rl = readline.createInterface({
      input: monitor.stdout,
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      const portInfo = parsePortInfo(line);

      if (portInfo) {
        const { port, protocol, key } = portInfo;

        // If this is a new port and not a well-known port, send a 'bound' event
        if (!boundPorts.has(key) && shouldMonitorPort(port)) {
          boundPorts.add(key);
          sendMessage({
            type: "port",
            action: "bound",
            port,
            protocol,
            timestamp: new Date().toISOString(),
          });
        }
      }
    });

    // Handle errors
    monitor.stderr.on("data", (data) => {
      sendMessage({
        type: "error",
        message: data.toString(),
        timestamp: new Date().toISOString(),
      });
    });

    // Handle process exit
    monitor.on("close", (code) => {
      if (code !== 0) {
        sendMessage({
          type: "error",
          message: `Monitor process exited with code ${code}`,
          timestamp: new Date().toISOString(),
        });

        // Restart monitoring after a short delay
        setTimeout(() => {
          startMonitoring();
        }, 5000);
      }
    });

    // Periodically check for unbound ports
    // This is a workaround since some commands don't directly report closed ports
    setInterval(() => {
      checkForUnboundPorts();
    }, 5000);
  } catch (err) {
    sendMessage({
      type: "error",
      message: `Failed to start port monitoring: ${
        err instanceof Error ? err.message : String(err)
      }`,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Check for ports that are no longer bound
 */
async function checkForUnboundPorts(): Promise<void> {
  try {
    const os = platform();
    let cmd: string;
    let args: string[];

    // Get current ports based on OS
    switch (os) {
      case "win32":
        cmd = "powershell";
        args = ["-Command", "netstat -n -a -p TCP | Select-String LISTENING"];
        break;
      case "darwin":
        cmd = "sh";
        args = ["-c", "lsof -i -P -n | grep LISTEN"];
        break;
      case "linux":
        cmd = "sh";
        args = ["-c", "ss -tulpn | grep LISTEN"];
        break;
      default:
        throw new Error(`Unsupported platform: ${os}`);
    }

    const currentPorts = new Set<string>();

    return new Promise((resolve) => {
      const proc = spawn(cmd, args);

      // Process stdout
      const rl = readline.createInterface({
        input: proc.stdout,
        crlfDelay: Infinity,
      });

      rl.on("line", (line) => {
        const portInfo = parsePortInfo(line);
        if (portInfo && shouldMonitorPort(portInfo.port)) {
          currentPorts.add(portInfo.key);
        }
      });

      proc.on("close", () => {
        // Find ports that are no longer bound
        for (const key of boundPorts) {
          if (!currentPorts.has(key)) {
            // Extract port and protocol from the key
            const [protocol, portStr] = key.split(":");
            if (!portStr) {
              continue;
            }

            const port = parseInt(portStr, 10);

            // Only report unbound events for non-well-known ports
            if (shouldMonitorPort(port)) {
              // Send unbound event
              sendMessage({
                type: "port",
                action: "unbound",
                port,
                protocol: protocol as "tcp" | "udp",
                timestamp: new Date().toISOString(),
              });
            }

            // Remove from tracked ports
            boundPorts.delete(key);
          }
        }

        resolve();
      });
    });
  } catch (err) {
    sendMessage({
      type: "error",
      message: `Failed to check for unbound ports: ${
        err instanceof Error ? err.message : String(err)
      }`,
      timestamp: new Date().toISOString(),
    });
  }
}

// Handle signals for graceful shutdown
process.on("SIGINT", () => {
  sendMessage({
    type: "error",
    message: "SIGINT received, shutting down port monitor...",
    timestamp: new Date().toISOString(),
  });
  process.exit(0);
});

process.on("SIGTERM", () => {
  sendMessage({
    type: "error",
    message: "SIGTERM received, shutting down port monitor...",
    timestamp: new Date().toISOString(),
  });
  process.exit(0);
});

// Start the monitor
sendMessage({
  type: "error", // Using error type for log messages
  message: "Port monitor starting...",
  timestamp: new Date().toISOString(),
});

startMonitoring();
