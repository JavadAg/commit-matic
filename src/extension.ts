import * as vscode from "vscode";
import { execSync } from "child_process";

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand(
    "smart-commit.generateMessage",
    async () => {
      const apiKey = await getApiKey(context);

      if (!apiKey) {
        vscode.window.showErrorMessage(
          "API key is required to generate commit messages."
        );
        return;
      }

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage("No workspace folder found.");
        return;
      }

      const workspacePath = workspaceFolders[0].uri.fsPath;

      try {
        execSync("git add .", { cwd: workspacePath });
        const gitDiff = execSync("git diff --cached", {
          cwd: workspacePath,
        }).toString();

        const commitMessage = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Window,
            title: "Generating Commit Message",
            cancellable: false,
          },
          async (progress) => {
            return await generateCommitMessage(gitDiff, apiKey);
          }
        );

        const userResponse = await vscode.window.showInformationMessage(
          "Generated commit message:",
          commitMessage,
          "Use this",
          "Edit"
        );
        if (userResponse === "Use this") {
          insertCommitMessage(commitMessage);
        } else if (userResponse === "Edit") {
          vscode.window
            .showInputBox({
              value: commitMessage,
              prompt: "Edit your commit message",
            })
            .then((finalMessage) => {
              if (finalMessage) {
                insertCommitMessage(finalMessage);
              }
            });
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(
          "Error generating commit message: " + error?.message
        );
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}

async function getApiKey(
  context: vscode.ExtensionContext
): Promise<string | undefined> {
  const storedApiKey = context.globalState.get<string>("openaiApiKey");
  if (storedApiKey) {
    return storedApiKey;
  }

  const apiKey = await vscode.window.showInputBox({
    prompt: "Enter your openrouter.ai API key",
    placeHolder: "sk-...",
    ignoreFocusOut: true,
    password: true,
  });

  if (apiKey) {
    await context.globalState.update("openaiApiKey", apiKey);
  }
  return apiKey;
}

async function generateCommitMessage(
  diff: string,
  apiKey: string
): Promise<string> {
  const url = "https://openrouter.ai/api/v1/chat/completions";

  try {
    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify({
        model: "openai/gpt-3.5-turbo",
        prompt: `Based on the following code changes, generate a concise, real-world commit message. Focus only on significant updates, and avoid mentioning minor changes like whitespace or formatting adjustments. Limit the commit message to a single sentence or a short paragraph that captures the main purpose of the changes: ${diff}`,
        max_tokens: 60,
        temperature: 0.5,
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    const data = (await response.json()) as {
      choices: { text: string }[];
    };

    return data.choices[0].text;
  } catch (error: any) {
    console.log(error);

    console.error("Error generating commit message: ", error.message);
    process.exit(1);
  }
}

function insertCommitMessage(message: string) {
  const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
  if (gitExtension) {
    const api = gitExtension.getAPI(1);
    const repository = api.repositories[0];
    repository.inputBox.value = message;
  }
}
