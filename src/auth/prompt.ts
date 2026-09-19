import { confirm, password } from "@inquirer/prompts";

export async function promptForToken(): Promise<string> {
  return await password({ message: "Discogs User Token:", mask: "*" });
}

export async function promptForConfirmation(message: string): Promise<boolean> {
  return await confirm({ message, default: false });
}
