import { createContext, useContext, useState, useCallback } from "react";

const translations = {
  en: {
    // Navigation
    dashboard: "Dashboard",
    crm: "CRM",
    clients: "Clients",
    events: "Events",
    recipes: "Recipes",
    inventory: "Inventory",
    documents: "Documents",
    settings: "Settings",
    logout: "Logout",
    
    // Common
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    create: "Create",
    search: "Search",
    filter: "Filter",
    actions: "Actions",
    status: "Status",
    name: "Name",
    email: "Email",
    phone: "Phone",
    address: "Address",
    notes: "Notes",
    date: "Date",
    total: "Total",
    loading: "Loading...",
    noResults: "No results found",
    
    // Auth
    login: "Login",
    register: "Register",
    password: "Password",
    confirmPassword: "Confirm Password",
    companyName: "Company Name",
    welcomeBack: "Welcome back",
    createAccount: "Create your account",
    continueWithGoogle: "Continue with Google",
    orContinueWith: "or continue with",
    
    // Dashboard
    welcomeDashboard: "Welcome to your dashboard",
    totalClients: "Total Clients",
    upcomingEvents: "Upcoming Events",
    totalRecipes: "Total Recipes",
    lowStockAlerts: "Low Stock Alerts",
    recentEvents: "Recent Events",
    salesPipeline: "Sales Pipeline",
    
    // CRM
    addClient: "Add Client",
    clientDetails: "Client Details",
    pipelineStage: "Pipeline Stage",
    totalRevenue: "Total Revenue",
    eventsCount: "Events",
    lead: "Lead",
    contacted: "Contacted",
    proposal: "Proposal",
    negotiation: "Negotiation",
    won: "Won",
    lost: "Lost",
    
    // Events
    addEvent: "Add Event",
    eventDetails: "Event Details",
    eventType: "Event Type",
    eventDate: "Event Date",
    venue: "Venue",
    guestCount: "Guest Count",
    budget: "Budget",
    timeline: "Timeline",
    tasks: "Tasks",
    menu: "Menu",
    planning: "Planning",
    confirmed: "Confirmed",
    inProgress: "In Progress",
    completed: "Completed",
    cancelled: "Cancelled",
    
    // Recipes
    addRecipe: "Add Recipe",
    recipeDetails: "Recipe Details",
    category: "Category",
    servings: "Servings",
    prepTime: "Prep Time",
    cookTime: "Cook Time",
    ingredients: "Ingredients",
    instructions: "Instructions",
    totalCost: "Total Cost",
    costPerServing: "Cost per Serving",
    aiAssistant: "AI Assistant",
    analyzeRecipe: "Analyze Recipe",
    
    // Inventory
    addIngredient: "Add Ingredient",
    ingredientDetails: "Ingredient Details",
    unit: "Unit",
    costPerUnit: "Cost per Unit",
    stockQuantity: "Stock Quantity",
    minStockLevel: "Min Stock Level",
    supplier: "Supplier",
    suppliers: "Suppliers",
    addSupplier: "Add Supplier",
    lowStock: "Low Stock",
    
    // Documents
    createDocument: "Create Document",
    quote: "Quote",
    beo: "Banquet Event Order",
    kitchenSheet: "Kitchen Sheet",
    packingList: "Packing List",
    miseEnPlace: "Mise en Place",
    documentType: "Document Type",
    sign: "Sign",
    signed: "Signed",
    draft: "Draft",
    sent: "Sent",
    
    // Settings
    companySettings: "Company Settings",
    branding: "Branding",
    templates: "Templates",
    users: "Users",
    language: "Language",
    currency: "Currency",
    primaryColor: "Primary Color",
    secondaryColor: "Secondary Color",
    logoUrl: "Logo URL",
    
    // Portal
    clientPortal: "Client Portal",
    signDocument: "Sign Document",
    thankYou: "Thank you for your signature!",
  },
  es: {
    // Navigation
    dashboard: "Panel",
    crm: "CRM",
    clients: "Clientes",
    events: "Eventos",
    recipes: "Recetas",
    inventory: "Inventario",
    documents: "Documentos",
    settings: "Configuración",
    logout: "Cerrar Sesión",
    
    // Common
    save: "Guardar",
    cancel: "Cancelar",
    delete: "Eliminar",
    edit: "Editar",
    create: "Crear",
    search: "Buscar",
    filter: "Filtrar",
    actions: "Acciones",
    status: "Estado",
    name: "Nombre",
    email: "Correo",
    phone: "Teléfono",
    address: "Dirección",
    notes: "Notas",
    date: "Fecha",
    total: "Total",
    loading: "Cargando...",
    noResults: "Sin resultados",
    
    // Auth
    login: "Iniciar Sesión",
    register: "Registrarse",
    password: "Contraseña",
    confirmPassword: "Confirmar Contraseña",
    companyName: "Nombre de la Empresa",
    welcomeBack: "Bienvenido de nuevo",
    createAccount: "Crea tu cuenta",
    continueWithGoogle: "Continuar con Google",
    orContinueWith: "o continuar con",
    
    // Dashboard
    welcomeDashboard: "Bienvenido a tu panel",
    totalClients: "Total Clientes",
    upcomingEvents: "Próximos Eventos",
    totalRecipes: "Total Recetas",
    lowStockAlerts: "Alertas Stock Bajo",
    recentEvents: "Eventos Recientes",
    salesPipeline: "Pipeline de Ventas",
    
    // CRM
    addClient: "Agregar Cliente",
    clientDetails: "Detalles del Cliente",
    pipelineStage: "Etapa del Pipeline",
    totalRevenue: "Ingresos Totales",
    eventsCount: "Eventos",
    lead: "Prospecto",
    contacted: "Contactado",
    proposal: "Propuesta",
    negotiation: "Negociación",
    won: "Ganado",
    lost: "Perdido",
    
    // Events
    addEvent: "Agregar Evento",
    eventDetails: "Detalles del Evento",
    eventType: "Tipo de Evento",
    eventDate: "Fecha del Evento",
    venue: "Lugar",
    guestCount: "Número de Invitados",
    budget: "Presupuesto",
    timeline: "Cronograma",
    tasks: "Tareas",
    menu: "Menú",
    planning: "Planificación",
    confirmed: "Confirmado",
    inProgress: "En Progreso",
    completed: "Completado",
    cancelled: "Cancelado",
    
    // Recipes
    addRecipe: "Agregar Receta",
    recipeDetails: "Detalles de Receta",
    category: "Categoría",
    servings: "Porciones",
    prepTime: "Tiempo de Preparación",
    cookTime: "Tiempo de Cocción",
    ingredients: "Ingredientes",
    instructions: "Instrucciones",
    totalCost: "Costo Total",
    costPerServing: "Costo por Porción",
    aiAssistant: "Asistente IA",
    analyzeRecipe: "Analizar Receta",
    
    // Inventory
    addIngredient: "Agregar Ingrediente",
    ingredientDetails: "Detalles del Ingrediente",
    unit: "Unidad",
    costPerUnit: "Costo por Unidad",
    stockQuantity: "Cantidad en Stock",
    minStockLevel: "Nivel Mínimo de Stock",
    supplier: "Proveedor",
    suppliers: "Proveedores",
    addSupplier: "Agregar Proveedor",
    lowStock: "Stock Bajo",
    
    // Documents
    createDocument: "Crear Documento",
    quote: "Cotización",
    beo: "Orden de Evento de Banquete",
    kitchenSheet: "Hoja de Cocina",
    packingList: "Lista de Empaque",
    miseEnPlace: "Mise en Place",
    documentType: "Tipo de Documento",
    sign: "Firmar",
    signed: "Firmado",
    draft: "Borrador",
    sent: "Enviado",
    
    // Settings
    companySettings: "Configuración de Empresa",
    branding: "Marca",
    templates: "Plantillas",
    users: "Usuarios",
    language: "Idioma",
    currency: "Moneda",
    primaryColor: "Color Primario",
    secondaryColor: "Color Secundario",
    logoUrl: "URL del Logo",
    
    // Portal
    clientPortal: "Portal del Cliente",
    signDocument: "Firmar Documento",
    thankYou: "¡Gracias por su firma!",
  },
};

const LanguageContext = createContext(null);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(() => {
    const saved = localStorage.getItem("eep_language");
    return saved || "en";
  });

  const t = useCallback(
    (key) => {
      return translations[language]?.[key] || translations.en[key] || key;
    },
    [language]
  );

  const changeLanguage = useCallback((lang) => {
    setLanguage(lang);
    localStorage.setItem("eep_language", lang);
  }, []);

  return (
    <LanguageContext.Provider value={{ language, t, changeLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};
