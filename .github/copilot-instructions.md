## Overview

This is a monorepo containing tools and packages written in TypeScript and JavaScript. We use yarn, yarn workspaces, and lage for our monorepo tooling.

## Coding

- When writing code, always ask for clarification instead of making assumptions.
- Always use best practices.
- Assume code shall be ran in node and not in the browser.

## Scripting

Scripts should be written to minimize dependencies for users. We should use bash for Unix based systems and PowerShell for Windows. If a script is not possible to write in bash or PowerShell, we should use Node.js.
