export function bootChemVaultFiles(): void {
  const shell = document.querySelector<HTMLElement>("[data-cv-shell]");

  if (shell) {
    shell.dataset.cvBooted = "true";
  }
}
