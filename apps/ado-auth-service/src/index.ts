import { IPC } from "node-ipc";
import { AzureCliCredential } from "@azure/identity";

const DEFAULT_ADO_SCOPE = "499b84ac-1321-427f-aa17-267ca6975798/.default";

// Configure IPC for TCP communication
const ipc = new IPC();
ipc.config.id = "azure-auth-service";
ipc.config.retry = 1500; // Retry interval
ipc.config.silent = true; // Suppress logs
ipc.config.networkPort = 9000; // Explicitly bind to port 9000
ipc.config.networkHost = "localhost"; // Bind to localhost for security

const log = (...args: { toString: () => string }[]) => {
  ipc.log(new Date().toISOString() + ": " + args.join(" "));
};

const startServer = (): Promise<void> => {
  const azureCliCredential = new AzureCliCredential();
  return new Promise<void>((resolve, reject) => {
    ipc.serveNet(() => {
      ipc.server.on("getAccessToken", async ({ scopes }, socket) => {
        log("Got request for token with scopes:", scopes);
        ipc.server.emit(
          socket,
          "accessToken",
          (
            await azureCliCredential.getToken(
              scopes?.split(" ") ?? DEFAULT_ADO_SCOPE
            )
          ).token
        );
      });
    });

    ipc.server.on("start", () => {
      resolve();
    });

    ipc.server.on("error", (err) => {
      reject(err);
    });

    ipc.server.start();
  });
};

startServer();

// Handle signals to allow graceful shutdown
process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down server...");
  ipc.server.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down server...");
  ipc.server.stop();
  process.exit(0);
});

// Keep process alive indefinitely
setInterval(() => {
  // This empty interval prevents Node.js from exiting
}, 10000); // 10 second interval

console.log(
  `Azure Authentication Service running on ${ipc.config.networkHost}:${ipc.config.networkPort}`
);
