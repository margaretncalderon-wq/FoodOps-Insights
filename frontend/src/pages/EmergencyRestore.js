// pages/EmergencyRestore.js - Emergency page to restore user's company
import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Alert, AlertDescription } from "../components/ui/alert";
import { AlertTriangle, CheckCircle, Building2, RefreshCw } from "lucide-react";

import { KoraLoader } from "../components/KoraLoader";
const API = process.env.REACT_APP_BACKEND_URL;

export default function EmergencyRestore() {
  const [status, setStatus] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, candidatesRes] = await Promise.all([
        axios.get(`${API}/api/emergency/my-status`, { withCredentials: true }),
        axios.get(`${API}/api/emergency/find-my-company`, { withCredentials: true })
      ]);
      setStatus(statusRes.data);
      setCandidates(candidatesRes.data.candidates || []);
    } catch (err) {
      setError(err.response?.data?.detail || "Error loading status. Make sure you're logged in.");
    }
    setLoading(false);
  };

  const handleRestore = async (companyId, companyName) => {
    if (!confirm(`¿Restaurar tu cuenta a "${companyName}"?\n\nEsto cambiará tu empresa actual.`)) {
      return;
    }
    
    setRestoring(true);
    setError(null);
    try {
      const res = await axios.post(
        `${API}/api/emergency/restore-company/${companyId}`,
        {},
        { withCredentials: true }
      );
      setResult(res.data);
      // Refresh status
      await fetchStatus();
    } catch (err) {
      setError(err.response?.data?.detail || "Error restoring account");
    }
    setRestoring(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <KoraLoader size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-800">
              <AlertTriangle className="w-5 h-5" />
              Restauración de Emergencia
            </CardTitle>
            <CardDescription className="text-yellow-700">
              Esta página te permite restaurar tu cuenta si fue afectada por el bug del selector de organización.
            </CardDescription>
          </CardHeader>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <AlertDescription className="text-green-800">
              <strong>¡Cuenta restaurada!</strong> {result.message}
              <br />
              <span className="text-sm">Por favor, recarga la página para ver los cambios.</span>
            </AlertDescription>
          </Alert>
        )}

        {status && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tu Estado Actual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p className="font-medium">{status.email}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Nombre</p>
                  <p className="font-medium">{status.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Empresa Actual</p>
                  <p className="font-medium text-red-600">{status.current_company_name}</p>
                  {status.current_company_legal_name && (
                    <p className="text-xs text-muted-foreground">{status.current_company_legal_name}</p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground">Company ID</p>
                  <p className="font-mono text-xs">{status.current_company_id}</p>
                </div>
              </div>

              {status.membership_companies?.length > 0 && (
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Tus Memberships:</p>
                  <div className="space-y-2">
                    {status.membership_companies.map((c) => (
                      <div key={c.company_id} className="flex items-center justify-between p-2 bg-muted rounded">
                        <div>
                          <p className="font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">Role: {c.role}</p>
                        </div>
                        {c.is_current ? (
                          <Badge variant="outline">Actual</Badge>
                        ) : (
                          <Button 
                            size="sm" 
                            onClick={() => handleRestore(c.company_id, c.name)}
                            disabled={restoring}
                          >
                            {restoring ? <KoraLoader size={16} /> : "Restaurar"}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {status.owned_companies?.length > 0 && (
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Empresas que Creaste:</p>
                  <div className="space-y-2">
                    {status.owned_companies.map((c) => (
                      <div key={c.company_id} className="flex items-center justify-between p-2 bg-green-50 rounded border border-green-200">
                        <div>
                          <p className="font-medium">{c.name}</p>
                          <p className="text-xs text-green-600">Propietario</p>
                        </div>
                        <Button 
                          size="sm" 
                          variant="default"
                          onClick={() => handleRestore(c.company_id, c.name)}
                          disabled={restoring || status.current_company_id === c.company_id}
                        >
                          {status.current_company_id === c.company_id ? "Actual" : "Restaurar"}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {candidates.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Empresas Encontradas</CardTitle>
              <CardDescription>
                Basándonos en tus datos, estas podrían ser tu empresa original:
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {candidates.map((c) => (
                  <div key={c.company_id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Building2 className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.reason}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={c.confidence === "very_high" ? "default" : c.confidence === "high" ? "secondary" : "outline"}>
                        {c.confidence}
                      </Badge>
                      <Button 
                        size="sm"
                        onClick={() => handleRestore(c.company_id, c.name)}
                        disabled={restoring}
                      >
                        Restaurar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-center">
          <Button variant="outline" onClick={fetchStatus} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Recargar Estado
          </Button>
        </div>

        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <p className="text-sm text-blue-800">
              <strong>Después de restaurar:</strong> Recarga la página completamente (Ctrl+Shift+R) 
              para que los cambios surtan efecto en toda la aplicación.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
