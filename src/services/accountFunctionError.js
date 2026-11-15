export function accountFunctionError(error) {
  const message = typeof error?.message === "string" ? error.message.trim() : "";
  const generic = !message || message.toLowerCase() === String(error?.code || "").replace("functions/", "").toLowerCase();
  if (generic && ["functions/internal", "functions/not-found", "functions/unavailable", "functions/deadline-exceeded"].includes(error?.code)) {
    return Object.assign(new Error(
      "The account service could not complete the request. Check that the Firebase account functions are deployed and available, then check their logs. Before retrying, check whether the account was already created.",
      { cause: error },
    ), { code: error.code });
  }
  return error;
}
