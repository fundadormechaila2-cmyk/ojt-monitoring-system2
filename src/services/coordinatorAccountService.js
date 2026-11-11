import {
  createCoordinatorLoginAccount,
  resendCoordinatorSetupEmail,
} from "./userManagementSevice";
import { auth } from "./firebase";

export async function createCoordinatorAccount({
  fullName,
  email,
  department,
}) {
  try {
    return await createCoordinatorLoginAccount({
      fullName,
      email,
      department,
      createdBy: auth.currentUser?.uid,
    });
  } catch (error) {
    if (error?.code === "auth/email-already-in-use") {
      throw new Error("This email address is already registered.", { cause: error });
    }
    throw new Error(error?.message || "Unable to create the coordinator account.", {
      cause: error,
    });
  }
}

export { resendCoordinatorSetupEmail };
