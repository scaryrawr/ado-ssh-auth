# ADO SSH Auth for GitHub Codespaces

A tool that enables Azure DevOps (ADO) authentication with GitHub Codespaces via SSH connections, without requiring VS Code (ish).

## Overview

This project provides authentication to Azure DevOps services when working with GitHub Codespaces over SSH. It leverages the Azure CLI credentials on your local machine and establishes a secure channel to make them available inside your codespace.

While solutions like the [Azure DevOps Codespaces Authentication](https://github.com/microsoft/ado-codespaces-auth) extension and [Artifacts Helper](https://github.com/microsoft/codespace-features/tree/main/src/artifacts-helper) exist, they are designed for VS Code.

This tool brings similar capabilities to regular SSH sessions. By leveraging their work.

- [Azure DevOps Codespaces Authentication](https://github.com/microsoft/ado-codespaces-auth) setup an ado-auth-helper script in the codespace that uses [node-ipc](https://github.com/RIAEvangelist/node-ipc) to request an ADO access token from the extension running in VS Code. We recreate the service outside of VS Code, so it can still request access tokens, but without VS Code running.
- [Artifacts Helper](https://github.com/microsoft/codespace-features/tree/main/src/artifacts-helper) adds authentication wrappers around commands like `yarn` and `npm`. They leverage the ado-auth-helper script provided by the ADO Codespaces Authentication extension.

This tool does not *yet* provide the ado-auth-helper script, so initial configuration of the codespace with VS Code is still required. However, once the codespace is set up, you can use this tool to authenticate without needing to run VS Code.

## Requirements

- GitHub CLI (`gh`) installed and authenticated
- Azure CLI (`az`) installed and logged in to the appropriate tenant
- `fzf` for interactive codespace selection

## Installation

1. Clone this repository
2. Build the authentication service:

   ```bash
   cd ado-ssh-auth
   yarn install
   yarn build
   ```

## Usage

Make sure to use the Azure CLI to login and setup to be able to request access tokens:

```bash
az login --scope 499b84ac-1321-427f-aa17-267ca6975798/.default
```

Then, run the `ado-gh-session` script to start a session:

```bash
./ado-gh-session
```

The script will:

1. Start the local auth service
2. Prompt you to select a GitHub Codespace
3. Establish a secure port forwarding channel for authentication
4. Start an interactive SSH session

Inside your codespace, tools like `git`, `npm`, and NuGet will automatically use the authentication provided by this service through the tooling provided by [Artifacts Helper](https://github.com/microsoft/codespace-features/tree/main/src/artifacts-helper).

## How It Works

```mermaid
graph
    subgraph "Local Machine"
        AzCLI["Azure CLI"]
        AuthSvc["ADO Auth Service<br>(Node.js + @azure/identity)"]
        SSH["GitHub CLI SSH"]
        AzCLI -->|provides credentials| AuthSvc
        AuthSvc -->|listens on port 9000| SSH
    end
    
    subgraph "GitHub Codespace"
        SSHSrv["SSH Server"]
        SocketPath["Unix Socket<br>(direct SSH socket forwarding)"]
        ADOHelper["ADO Auth Helper<br>(from ado-codespaces-auth)"]
        Tools["Development Tools<br>(git, npm, dotnet, etc.)"]
        
        SSHSrv -->|forwards to Unix socket| SocketPath
        SocketPath -->|UNIX socket IPC| ADOHelper
        ADOHelper -->|provides ADO tokens| Tools
        Tools -->|requests token| ADOHelper
        ADOHelper -->|requests token via IPC| SocketPath
    end
    
    SSH -->|Remote Port Forwarding<br>-R /tmp/ado-auth-*.sock:localhost:9000| SSHSrv
    SocketPath -.->|node-ipc over socket| AuthSvc
    Tools -.->|auth with ADO| Ext["Azure DevOps Services"]
```

Under the hood, this tool:

1. **Local Authentication Service**: Starts a Node.js service using the `@azure/identity` package that connects to your Azure CLI credentials
2. **SSH Socket Forwarding**: Establishes an SSH connection that directly forwards the local authentication service to a Unix socket in the codespace using SSH's remote socket forwarding capability
3. **Token Delivery**: Provides ADO access tokens to tools inside the codespace when needed

This approach leverages the same tools and workflows that the official ADO Codespaces authentication helpers provide.

## Adding Additional Port Forwarding

If you need to forward additional ports from your codespace, you can open another terminal and run:

```bash
codespace="your-codespace-name" # The name from 'gh cs ls'
gh cs ssh -c "$codespace" -- -L local_port:localhost:remote_port -N
```

## Limitations

- Authentication is tied to your local Azure CLI session
