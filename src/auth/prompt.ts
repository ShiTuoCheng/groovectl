import { password } from "@inquirer/prompts";

export async function promptForToken(): Promise<string> {
  return await password({ message: "Discogs User Token:", mask: "*" });
}
