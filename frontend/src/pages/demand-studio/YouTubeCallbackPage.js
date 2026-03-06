import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Youtube } from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";

const API = process.env.REACT_APP_BACKEND_URL;

export default function YouTubeCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("processing"); // processing, success, error
  const [message, setMessage] = useState("Conectando tu canal de YouTube...");
  const [channelData, setChannelData] = useState(null);

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get("code");
      const error = searchParams.get("error");

      if (error) {
        setStatus("error");
        setMessage(error === "access_denied" 
          ? "Acceso denegado. Por favor intenta de nuevo."
          : `Error: ${error}`
        );
        return;
      }

      if (!code) {
        setStatus("error");
        setMessage("No se recibió código de autorización");
        return;
      }

      try {
        const response = await axios.post(
          `${API}/api/demand-studio/social-metrics/youtube/callback`,
          {
            code,
            redirect_uri: `${window.location.origin}/demand-studio/youtube-callback`
          },
          { withCredentials: true }
        );

        setStatus("success");
        setChannelData(response.data);
        setMessage("¡Canal conectado exitosamente!");
        toast.success("YouTube conectado correctamente");

        // Redirect after 2 seconds
        setTimeout(() => {
          navigate("/demand-studio/social-media");
        }, 2500);
      } catch (err) {
        console.error("YouTube callback error:", err);
        setStatus("error");
        setMessage(err.response?.data?.detail || "Error al conectar con YouTube");
        toast.error("Error al conectar YouTube");
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-8 text-center">
          {/* YouTube Icon */}
          <div className={`w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center ${
            status === "processing" ? "bg-red-100" :
            status === "success" ? "bg-green-100" : "bg-red-100"
          }`}>
            {status === "processing" && (
              <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
            )}
            {status === "success" && (
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            )}
            {status === "error" && (
              <XCircle className="w-8 h-8 text-red-600" />
            )}
          </div>

          {/* Status Message */}
          <h2 className="text-xl font-semibold mb-2">
            {status === "processing" && "Conectando YouTube..."}
            {status === "success" && "¡Conexión Exitosa!"}
            {status === "error" && "Error de Conexión"}
          </h2>
          <p className="text-muted-foreground mb-6">{message}</p>

          {/* Channel Info on Success */}
          {status === "success" && channelData && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
              <div className="flex items-center gap-3 mb-3">
                {channelData.profile_picture ? (
                  <img 
                    src={channelData.profile_picture} 
                    alt="" 
                    className="w-12 h-12 rounded-full"
                  />
                ) : (
                  <Youtube className="w-12 h-12 text-red-600" />
                )}
                <div>
                  <p className="font-medium">{channelData.account_name}</p>
                  <p className="text-sm text-muted-foreground">YouTube</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Suscriptores:</span>
                  <span className="font-medium ml-1">
                    {channelData.followers_count?.toLocaleString() || 0}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Videos:</span>
                  <span className="font-medium ml-1">
                    {channelData.posts_count || 0}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          {status === "error" && (
            <div className="space-y-2">
              <Button onClick={() => navigate("/demand-studio/social-media")} className="w-full">
                Volver a Social Media
              </Button>
              <Button variant="outline" onClick={() => window.location.reload()} className="w-full">
                Reintentar
              </Button>
            </div>
          )}

          {status === "success" && (
            <p className="text-sm text-muted-foreground">
              Redirigiendo a Social Media...
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
