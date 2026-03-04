import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Separator } from "../components/ui/separator";
import { Input } from "../components/ui/input";
import { 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  User, 
  Building2, 
  Users,
  ArrowRight,
  Shield,
  Loader2,
  Search
} from "lucide-react";
import axios from "axios";

const API = process.env.REACT_APP_BACKEND_URL;

export default function EmergencyRestorePage() {
  const { user, token, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [companyUsers, setCompanyUsers] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [bulkRestoring, setBulkRestoring] = useState(false);
  const [message, setMessage] = useState(null);
  const [selectedCompanyForUsers, setSelectedCompanyForUsers] = useState(null);
  
  // Search functionality
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [allCompanies, setAllCompanies] = useState([]);
  const [showAllCompanies, setShowAllCompanies] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!token) return;
    
    setLoading(true);
    try {
      const [statusRes, candidatesRes] = await Promise.all([
        axios.get(`${API}/api/emergency/my-status`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/api/emergency/find-my-company`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      
      setStatus(statusRes.data);
      setCandidates(candidatesRes.data.candidates || []);
    } catch (err) {
      console.error("Error fetching status:", err);
      setMessage({ type: "error", text: "Error al cargar el estado: " + (err.response?.data?.detail || err.message) });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Search companies
  const handleSearch = async () => {
    if (searchQuery.length < 2) return;
    
    setSearching(true);
    try {
      const res = await axios.get(
        `${API}/api/emergency/search-companies?q=${encodeURIComponent(searchQuery)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSearchResults(res.data.companies || []);
    } catch (err) {
      setMessage({ type: "error", text: "Error buscando: " + (err.response?.data?.detail || err.message) });
    } finally {
      setSearching(false);
    }
  };

  // Load all companies
  const loadAllCompanies = async () => {
    setShowAllCompanies(true);
    try {
      const res = await axios.get(
        `${API}/api/emergency/all-companies`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setAllCompanies(res.data.companies || []);
    } catch (err) {
      setMessage({ type: "error", text: "Error: " + (err.response?.data?.detail || err.message) });
    }
  };

  // Force restore (without membership check)
  const handleForceRestore = async (companyId, companyName) => {
    if (!confirm(`¿Estás seguro de restaurar tu cuenta a "${companyName}"? Esto también creará una membresía si no existe.`)) {
      return;
    }
    
    setRestoring(true);
    setMessage(null);
    
    try {
      const res = await axios.post(
        `${API}/api/emergency/force-restore/${companyId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setMessage({ 
        type: "success", 
        text: `✅ ${res.data.message}. ${res.data.membership_created ? "Se creó una nueva membresía." : ""} Por favor, cierra sesión y vuelve a iniciar sesión.`
      });
      
      await fetchStatus();
    } catch (err) {
      setMessage({ type: "error", text: "Error: " + (err.response?.data?.detail || err.message) });
    } finally {
      setRestoring(false);
    }
  };

  const handleRestore = async (companyId, companyName) => {
    if (!confirm(`¿Estás seguro de restaurar tu cuenta a "${companyName}"?`)) {
      return;
    }
    
    setRestoring(true);
    setMessage(null);
    
    try {
      const res = await axios.post(
        `${API}/api/emergency/restore-company/${companyId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setMessage({ 
        type: "success", 
        text: `✅ ${res.data.message}. Por favor, cierra sesión y vuelve a iniciar sesión para ver los cambios.`
      });
      
      // Refresh status
      await fetchStatus();
    } catch (err) {
      setMessage({ 
        type: "error", 
        text: "Error: " + (err.response?.data?.detail || err.message) 
      });
    } finally {
      setRestoring(false);
    }
  };

  const fetchCompanyUsers = async (companyId) => {
    setSelectedCompanyForUsers(companyId);
    setCompanyUsers(null);
    
    try {
      const res = await axios.get(
        `${API}/api/emergency/company-users/${companyId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCompanyUsers(res.data);
    } catch (err) {
      setMessage({ 
        type: "error", 
        text: "Error al cargar usuarios: " + (err.response?.data?.detail || err.message) 
      });
    }
  };

  const handleBulkRestore = async (companyId, companyName) => {
    if (!confirm(`¿Restaurar TODOS los usuarios de "${companyName}" a esta empresa? Esto cambiará el company_id de todos los usuarios con membresía.`)) {
      return;
    }
    
    setBulkRestoring(true);
    setMessage(null);
    
    try {
      const res = await axios.post(
        `${API}/api/emergency/bulk-restore-company-users/${companyId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setMessage({ 
        type: "success", 
        text: `✅ ${res.data.restored_count} usuarios restaurados a ${companyName}. ${res.data.skipped_count} usuarios ya estaban en la empresa correcta.`
      });
      
      // Refresh company users
      await fetchCompanyUsers(companyId);
    } catch (err) {
      setMessage({ 
        type: "error", 
        text: "Error: " + (err.response?.data?.detail || err.message) 
      });
    } finally {
      setBulkRestoring(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              No Autenticado
            </CardTitle>
            <CardDescription>
              Debes iniciar sesión para usar esta herramienta de restauración.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <a href="/login">Ir a Iniciar Sesión</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-amber-500">
            <Shield className="w-8 h-8" />
            <h1 className="text-2xl md:text-3xl font-bold">Restauración de Emergencia</h1>
          </div>
          <p className="text-zinc-400">
            Herramienta para restaurar tu cuenta después del error del conmutador de organización.
          </p>
        </div>

        {/* Alert Message */}
        {message && (
          <Alert variant={message.type === "error" ? "destructive" : "default"} 
                 className={message.type === "success" ? "border-green-500 bg-green-500/10" : ""}>
            {message.type === "success" ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <AlertTriangle className="w-4 h-4" />}
            <AlertTitle>{message.type === "success" ? "Éxito" : "Error"}</AlertTitle>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {/* Current Status */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-blue-400" />
              Tu Estado Actual
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {status && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-zinc-400">Email</p>
                  <p className="font-medium">{status.email}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-zinc-400">Nombre</p>
                  <p className="font-medium">{status.name}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-zinc-400">Empresa Actual</p>
                  <p className="font-medium text-amber-400">
                    {status.current_company_name}
                    {status.current_company_legal_name && (
                      <span className="text-zinc-500 text-sm ml-2">
                        ({status.current_company_legal_name})
                      </span>
                    )}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-zinc-400">Company ID Actual</p>
                  <code className="text-xs bg-zinc-800 px-2 py-1 rounded">
                    {status.current_company_id}
                  </code>
                </div>
              </div>
            )}
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchStatus}
              className="mt-4"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Actualizar Estado
            </Button>
          </CardContent>
        </Card>

        {/* Restore Options */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-green-400" />
              Restaurar Tu Empresa
            </CardTitle>
            <CardDescription>
              Selecciona la empresa correcta a la que debe apuntar tu cuenta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Candidates */}
            {candidates.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-zinc-400 font-medium">Empresas encontradas automáticamente:</p>
                {candidates.map((c, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg border border-zinc-700"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-sm text-zinc-400">{c.reason}</p>
                      <Badge variant={c.confidence === "very_high" ? "default" : c.confidence === "high" ? "secondary" : "outline"}>
                        Confianza: {c.confidence}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchCompanyUsers(c.company_id)}
                      >
                        <Users className="w-4 h-4 mr-1" />
                        Ver Usuarios
                      </Button>
                      <Button 
                        onClick={() => handleRestore(c.company_id, c.name)}
                        disabled={restoring || status?.current_company_id === c.company_id}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {restoring ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <ArrowRight className="w-4 h-4 mr-2" />
                        )}
                        {status?.current_company_id === c.company_id ? "Ya Activa" : "Restaurar"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Alert className="border-amber-500/50 bg-amber-500/10">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <AlertTitle className="text-amber-400">No se encontraron empresas automáticamente</AlertTitle>
                <AlertDescription>
                  Usa la búsqueda abajo para encontrar tu empresa por nombre.
                </AlertDescription>
              </Alert>
            )}

            {/* Search Section */}
            <Separator className="my-6 bg-zinc-700" />
            <div className="space-y-4">
              <p className="text-sm text-zinc-400 font-medium">🔍 Buscar tu empresa por nombre:</p>
              <div className="flex gap-2">
                <Input
                  placeholder="Escribe el nombre de tu empresa..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                  className="bg-zinc-800 border-zinc-700"
                />
                <Button onClick={handleSearch} disabled={searching || searchQuery.length < 2}>
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="space-y-2 mt-4">
                  <p className="text-sm text-zinc-400">Resultados ({searchResults.length}):</p>
                  {searchResults.map((c, idx) => (
                    <div 
                      key={idx}
                      className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-lg">{c.name}</p>
                          {c.legal_name && <p className="text-sm text-zinc-500">{c.legal_name}</p>}
                          <code className="text-xs text-zinc-500">{c.company_id}</code>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fetchCompanyUsers(c.company_id)}
                          >
                            <Users className="w-4 h-4 mr-1" />
                            Ver Usuarios
                          </Button>
                          <Button
                            onClick={() => handleForceRestore(c.company_id, c.name)}
                            disabled={restoring}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            {restoring ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                            Restaurar Mi Cuenta
                          </Button>
                        </div>
                      </div>
                      
                      {/* Show users inline if this company is selected */}
                      {companyUsers && companyUsers.company_id === c.company_id && (
                        <div className="mt-4 p-4 bg-zinc-900 rounded-lg border border-purple-500/50">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <p className="font-medium text-purple-400">Usuarios de {companyUsers.company_name}</p>
                              <p className="text-sm text-zinc-400">
                                {companyUsers.total_users} usuarios • {companyUsers.users_needing_fix || 0} necesitan arreglo
                              </p>
                            </div>
                            <Button
                              onClick={() => handleBulkRestore(c.company_id, c.name)}
                              disabled={bulkRestoring}
                              className="bg-purple-600 hover:bg-purple-700"
                            >
                              {bulkRestoring ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                              Restaurar Todos los Usuarios
                            </Button>
                          </div>
                          
                          {companyUsers.users.length > 0 ? (
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {companyUsers.users.map((u, uidx) => (
                                <div 
                                  key={uidx}
                                  className={`flex items-center justify-between p-2 rounded text-sm ${
                                    u.is_pointing_to_this_company 
                                      ? "bg-green-500/10 border border-green-500/30" 
                                      : "bg-red-500/10 border border-red-500/30"
                                  }`}
                                >
                                  <div>
                                    <span className="font-medium">{u.email}</span>
                                    <span className="text-zinc-500 ml-2">({u.role})</span>
                                  </div>
                                  {u.is_pointing_to_this_company ? (
                                    <Badge className="bg-green-600 text-xs">✓ OK</Badge>
                                  ) : (
                                    <Badge variant="destructive" className="text-xs">⚠ Incorrecto</Badge>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-zinc-500 text-sm">No se encontraron usuarios con membresía a esta empresa.</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Show All Companies Button */}
              <div className="mt-4">
                <Button variant="outline" onClick={loadAllCompanies} className="w-full">
                  <Building2 className="w-4 h-4 mr-2" />
                  Ver Todas las Empresas
                </Button>
              </div>

              {/* All Companies List */}
              {showAllCompanies && allCompanies.length > 0 && (
                <div className="space-y-2 mt-4 max-h-64 overflow-y-auto">
                  <p className="text-sm text-zinc-400">Todas las empresas ({allCompanies.length}):</p>
                  {allCompanies.map((c, idx) => (
                    <div 
                      key={idx}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        status?.current_company_id === c.company_id 
                          ? "bg-amber-500/10 border-amber-500" 
                          : "bg-zinc-800/30 border-zinc-700"
                      }`}
                    >
                      <div>
                        <p className="font-medium">{c.name}</p>
                        {c.legal_name && <p className="text-sm text-zinc-500">{c.legal_name}</p>}
                      </div>
                      {status?.current_company_id === c.company_id ? (
                        <Badge className="bg-amber-500">Actual</Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleForceRestore(c.company_id, c.name)}
                          disabled={restoring}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          Restaurar
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Memberships */}
            {status?.membership_companies?.length > 0 && (
              <>
                <Separator className="my-4 bg-zinc-700" />
                <p className="text-sm text-zinc-400 font-medium">Todas tus membresías:</p>
                <div className="space-y-2">
                  {status.membership_companies.map((m, idx) => (
                    <div 
                      key={idx}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        m.is_current 
                          ? "bg-amber-500/10 border-amber-500" 
                          : "bg-zinc-800/30 border-zinc-700"
                      }`}
                    >
                      <div>
                        <span className="font-medium">{m.name || m.legal_name}</span>
                        <Badge variant="outline" className="ml-2">{m.role}</Badge>
                        {m.is_current && <Badge className="ml-2 bg-amber-500">Actual</Badge>}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => fetchCompanyUsers(m.company_id)}
                        >
                          <Users className="w-4 h-4" />
                        </Button>
                        {!m.is_current && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRestore(m.company_id, m.name)}
                            disabled={restoring}
                          >
                            Restaurar
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Company Users Section */}
        {companyUsers && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-purple-400" />
                    Usuarios de {companyUsers.company_name}
                  </CardTitle>
                  <CardDescription>
                    {companyUsers.total_users} usuarios con acceso a esta empresa
                  </CardDescription>
                </div>
                <Button
                  onClick={() => handleBulkRestore(companyUsers.company_id, companyUsers.company_name)}
                  disabled={bulkRestoring}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {bulkRestoring ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Restaurar Todos
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {companyUsers.users.map((u, idx) => (
                  <div 
                    key={idx}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      u.is_pointing_to_this_company 
                        ? "bg-green-500/10 border-green-500/50" 
                        : "bg-red-500/10 border-red-500/50"
                    }`}
                  >
                    <div className="space-y-1">
                      <p className="font-medium">{u.email}</p>
                      <div className="flex gap-2 text-sm">
                        <Badge variant="outline">{u.role}</Badge>
                        {u.is_pointing_to_this_company ? (
                          <Badge className="bg-green-600">✓ Correcto</Badge>
                        ) : (
                          <Badge variant="destructive">⚠ Empresa incorrecta</Badge>
                        )}
                      </div>
                      {!u.is_pointing_to_this_company && (
                        <p className="text-xs text-zinc-500">
                          Actualmente apunta a: {u.current_company_id}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Instructions */}
        <Card className="bg-zinc-900 border-amber-500/50">
          <CardHeader>
            <CardTitle className="text-amber-400">Instrucciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-zinc-300">
            <p><strong>1.</strong> Revisa tu "Estado Actual" para ver a qué empresa apunta tu cuenta ahora.</p>
            <p><strong>2.</strong> Busca tu empresa correcta en "Restaurar Tu Empresa" y haz clic en "Restaurar".</p>
            <p><strong>3.</strong> Si necesitas restaurar los usuarios de una empresa (como Staffdo), haz clic en "Ver Usuarios" y luego "Restaurar Todos".</p>
            <p><strong>4.</strong> Después de restaurar, <strong>cierra sesión y vuelve a iniciar sesión</strong> para que los cambios surtan efecto.</p>
          </CardContent>
        </Card>

        {/* Logout Button */}
        <div className="text-center">
          <Button 
            variant="outline" 
            onClick={logout}
            className="border-zinc-600"
          >
            Cerrar Sesión para Aplicar Cambios
          </Button>
        </div>
      </div>
    </div>
  );
}
