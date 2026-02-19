import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function GoogleCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { handleGoogleCallback } = useAuth();
  const hasProcessed = useRef(false);
  const [status, setStatus] = useState("processing");

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      console.error("Google auth error:", error);
      toast.error("Error al autenticar con Google");
      navigate("/login", { replace: true });
      return;
    }

    if (code) {
      const redirectUri = window.location.origin + "/auth/google/callback";
      
      handleGoogleCallback(code, redirectUri)
        .then((response) => {
          if (response.requires_registration) {
            // New user - redirect to register page with Google data
            const googleData = response.google_data;
            const tempToken = response.temp_token;
            
            // Store Google data temporarily and redirect to register
            sessionStorage.setItem("google_registration_data", JSON.stringify({
              name: googleData.name,
              email: googleData.email,
              picture: googleData.picture,
              temp_token: tempToken
            }));
            
            setStatus("redirecting");
            toast.success("¡Verificado! Completa tu registro");
            navigate("/register?from=google", { replace: true });
          } else {
            // Existing user - proceed to dashboard
            setStatus("success");
            navigate("/dashboard", { replace: true });
          }
        })
        .catch((err) => {
          console.error("Google callback failed:", err);
          toast.error("Error al procesar autenticación de Google");
          navigate("/login", { replace: true });
        });
    } else {
      navigate("/login", { replace: true });
    }
  }, [searchParams, handleGoogleCallback, navigate]);

  // Loading/processing state
  return (
    <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-[#2A2F3A]" />
        <p className="text-[#6B7280]">
          {status === "redirecting" ? "Redirigiendo al registro..." : "Verificando autenticación..."}
        </p>
      </div>
    </div>
  );
}
