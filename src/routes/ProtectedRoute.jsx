import { Navigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";

function ProtectedRoute({ children }) {
    const { user, termsAccepted, termsStatusReady } = useAuth();

    if (!user) {
        return <Navigate to="/" replace />;
    }

    if (!termsStatusReady || !termsAccepted) {
        return <Navigate to="/" replace />;
    }

    return children;
}

export default ProtectedRoute;
