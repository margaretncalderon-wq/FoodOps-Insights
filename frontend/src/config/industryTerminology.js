// industryTerminology.js - Terminología inclusiva por industria

export const INDUSTRY_TERMINOLOGY = {
  // Events & Hospitality
  events_hospitality: {
    id: "events_hospitality",
    name: { en: "Events & Hospitality", es: "Eventos y Hospitalidad" },
    description: { 
      en: "For catering companies, wedding planners, and event venues", 
      es: "Para empresas de catering, wedding planners y venues de eventos" 
    },
    icon: "calendar",
    events: {
      module_name: { en: "Event Orchestration", es: "Orquestación de Eventos" },
      entity_singular: { en: "Event", es: "Evento" },
      entity_plural: { en: "Events", es: "Eventos" },
      client: { en: "Client", es: "Cliente" },
      clients: { en: "Clients", es: "Clientes" },
      lead: { en: "Lead", es: "Prospecto" },
      leads: { en: "Leads", es: "Prospectos" },
      guest: { en: "Guest", es: "Invitado" },
      guests: { en: "Guests", es: "Invitados" },
      venue: { en: "Venue", es: "Lugar" },
      venues: { en: "Venues", es: "Lugares" },
      booking: { en: "Booking", es: "Reserva" },
      bookings: { en: "Bookings", es: "Reservas" },
      catering: { en: "Catering", es: "Catering" },
      menu: { en: "Menu", es: "Menú" },
      menus: { en: "Menus", es: "Menús" },
      appointment: { en: "Event Date", es: "Fecha del Evento" },
      service: { en: "Event Service", es: "Servicio de Evento" },
    },
    crm: {
      module_name: { en: "Client Engagement", es: "Gestión de Clientes" },
      pipeline: { en: "Event Pipeline", es: "Pipeline de Eventos" },
      deal: { en: "Event Deal", es: "Negociación de Evento" },
      deals: { en: "Event Deals", es: "Negociaciones de Eventos" },
      contact: { en: "Contact", es: "Contacto" },
      contacts: { en: "Contacts", es: "Contactos" },
    },
    finance: {
      module_name: { en: "Business Clarity", es: "Claridad de Negocio" },
      invoice: { en: "Invoice", es: "Factura" },
      invoices: { en: "Invoices", es: "Facturas" },
      quote: { en: "Quote", es: "Cotización" },
      quotes: { en: "Quotes", es: "Cotizaciones" },
      payment: { en: "Payment", es: "Pago" },
      deposit: { en: "Deposit", es: "Anticipo" },
    },
    team: {
      owner: { en: "Event Manager", es: "Gerente de Eventos" },
      member: { en: "Team Member", es: "Miembro del Equipo" },
      members: { en: "Team Members", es: "Miembros del Equipo" },
      coordinator: { en: "Coordinator", es: "Coordinador/a" },
      planner: { en: "Event Planner", es: "Planificador/a de Eventos" },
      assigned_to: { en: "Assigned To", es: "Asignado A" },
    }
  },

  // Agency / Professional Services
  // Note: "professional_services" is the backend key, "agency" is kept for backwards compatibility
  professional_services: {
    id: "professional_services",
    name: { en: "Professional Services", es: "Servicios Profesionales" },
    description: { 
      en: "For agencies, marketing firms, and professional service providers", 
      es: "Para agencias, firmas de marketing y proveedores de servicios profesionales" 
    },
    icon: "briefcase",
    events: {
      module_name: { en: "Program Orchestration", es: "Orquestación de Programas" },
      entity_singular: { en: "Project", es: "Proyecto" },
      entity_plural: { en: "Projects", es: "Proyectos" },
      client: { en: "Client", es: "Cliente" },
      clients: { en: "Clients", es: "Clientes" },
      lead: { en: "Prospect", es: "Prospecto" },
      leads: { en: "Prospects", es: "Prospectos" },
      guest: { en: "Stakeholder", es: "Stakeholder" },
      guests: { en: "Stakeholders", es: "Stakeholders" },
      venue: { en: "Location", es: "Ubicación" },
      venues: { en: "Locations", es: "Ubicaciones" },
      booking: { en: "Engagement", es: "Contrato" },
      bookings: { en: "Engagements", es: "Contratos" },
      catering: { en: "Resources", es: "Recursos" },
      menu: { en: "Service Package", es: "Paquete de Servicios" },
      menus: { en: "Service Packages", es: "Paquetes de Servicios" },
      appointment: { en: "Start Date", es: "Fecha de Inicio" },
      service: { en: "Service", es: "Servicio" },
    },
    crm: {
      module_name: { en: "Client Engagement", es: "Gestión de Clientes" },
      pipeline: { en: "Sales Pipeline", es: "Pipeline de Ventas" },
      deal: { en: "Deal", es: "Negociación" },
      deals: { en: "Deals", es: "Negociaciones" },
      contact: { en: "Contact", es: "Contacto" },
      contacts: { en: "Contacts", es: "Contactos" },
    },
    finance: {
      module_name: { en: "Business Clarity", es: "Claridad de Negocio" },
      invoice: { en: "Invoice", es: "Factura" },
      invoices: { en: "Invoices", es: "Facturas" },
      quote: { en: "Proposal", es: "Propuesta" },
      quotes: { en: "Proposals", es: "Propuestas" },
      payment: { en: "Payment", es: "Pago" },
      deposit: { en: "Retainer", es: "Anticipo" },
    },
    team: {
      owner: { en: "Account Manager", es: "Gerente de Cuenta" },
      member: { en: "Team Member", es: "Miembro del Equipo" },
      members: { en: "Team Members", es: "Miembros del Equipo" },
      coordinator: { en: "Project Lead", es: "Líder de Proyecto" },
      planner: { en: "Strategist", es: "Estratega" },
      assigned_to: { en: "Assigned To", es: "Asignado A" },
    }
  },

  // Healthcare / Medical
  healthcare: {
    id: "healthcare",
    name: { en: "Healthcare", es: "Salud" },
    description: { 
      en: "For clinics, medical practices, and healthcare providers", 
      es: "Para clínicas, consultorios médicos y proveedores de salud" 
    },
    icon: "heart-pulse",
    events: {
      module_name: { en: "Patient Management", es: "Gestión de Pacientes" },
      entity_singular: { en: "Appointment", es: "Cita" },
      entity_plural: { en: "Appointments", es: "Citas" },
      client: { en: "Patient", es: "Paciente" },
      clients: { en: "Patients", es: "Pacientes" },
      lead: { en: "New Patient", es: "Paciente Nuevo" },
      leads: { en: "New Patients", es: "Pacientes Nuevos" },
      guest: { en: "Family Member", es: "Familiar" },
      guests: { en: "Family Members", es: "Familiares" },
      venue: { en: "Clinic", es: "Clínica" },
      venues: { en: "Clinics", es: "Clínicas" },
      booking: { en: "Appointment", es: "Cita" },
      bookings: { en: "Appointments", es: "Citas" },
      catering: { en: "Treatment", es: "Tratamiento" },
      menu: { en: "Treatment Plan", es: "Plan de Tratamiento" },
      menus: { en: "Treatment Plans", es: "Planes de Tratamiento" },
      appointment: { en: "Appointment Date", es: "Fecha de Cita" },
      service: { en: "Medical Service", es: "Servicio Médico" },
    },
    crm: {
      module_name: { en: "Patient Relations", es: "Relaciones con Pacientes" },
      pipeline: { en: "Patient Journey", es: "Recorrido del Paciente" },
      deal: { en: "Case", es: "Caso" },
      deals: { en: "Cases", es: "Casos" },
      contact: { en: "Patient", es: "Paciente" },
      contacts: { en: "Patients", es: "Pacientes" },
    },
    finance: {
      module_name: { en: "Billing", es: "Facturación" },
      invoice: { en: "Medical Bill", es: "Cuenta Médica" },
      invoices: { en: "Medical Bills", es: "Cuentas Médicas" },
      quote: { en: "Treatment Estimate", es: "Presupuesto de Tratamiento" },
      quotes: { en: "Treatment Estimates", es: "Presupuestos de Tratamiento" },
      payment: { en: "Payment", es: "Pago" },
      deposit: { en: "Co-pay", es: "Copago" },
    },
    team: {
      owner: { en: "Primary Physician", es: "Médico Principal" },
      member: { en: "Staff Member", es: "Personal Médico" },
      members: { en: "Staff Members", es: "Personal Médico" },
      coordinator: { en: "Care Coordinator", es: "Coordinador de Cuidado" },
      planner: { en: "Treatment Planner", es: "Planificador de Tratamiento" },
      assigned_to: { en: "Assigned Doctor", es: "Médico Asignado" },
    }
  },

  // Real Estate
  real_estate: {
    id: "real_estate",
    name: { en: "Real Estate", es: "Bienes Raíces" },
    description: { 
      en: "For real estate agencies, property managers, and brokers", 
      es: "Para inmobiliarias, administradores de propiedades y corredores" 
    },
    icon: "home",
    events: {
      module_name: { en: "Property Management", es: "Gestión de Propiedades" },
      entity_singular: { en: "Showing", es: "Visita" },
      entity_plural: { en: "Showings", es: "Visitas" },
      client: { en: "Buyer/Seller", es: "Comprador/Vendedor" },
      clients: { en: "Buyers/Sellers", es: "Compradores/Vendedores" },
      lead: { en: "Prospect", es: "Prospecto" },
      leads: { en: "Prospects", es: "Prospectos" },
      guest: { en: "Viewer", es: "Visitante" },
      guests: { en: "Viewers", es: "Visitantes" },
      venue: { en: "Property", es: "Propiedad" },
      venues: { en: "Properties", es: "Propiedades" },
      booking: { en: "Listing", es: "Listado" },
      bookings: { en: "Listings", es: "Listados" },
      catering: { en: "Amenities", es: "Amenidades" },
      menu: { en: "Property Features", es: "Características" },
      menus: { en: "Property Features", es: "Características" },
      appointment: { en: "Showing Date", es: "Fecha de Visita" },
      service: { en: "Real Estate Service", es: "Servicio Inmobiliario" },
    },
    crm: {
      module_name: { en: "Client Relations", es: "Relaciones con Clientes" },
      pipeline: { en: "Sales Pipeline", es: "Pipeline de Ventas" },
      deal: { en: "Transaction", es: "Transacción" },
      deals: { en: "Transactions", es: "Transacciones" },
      contact: { en: "Contact", es: "Contacto" },
      contacts: { en: "Contacts", es: "Contactos" },
    },
    finance: {
      module_name: { en: "Commissions", es: "Comisiones" },
      invoice: { en: "Commission Invoice", es: "Factura de Comisión" },
      invoices: { en: "Commission Invoices", es: "Facturas de Comisión" },
      quote: { en: "Price Estimate", es: "Estimación de Precio" },
      quotes: { en: "Price Estimates", es: "Estimaciones de Precio" },
      payment: { en: "Payment", es: "Pago" },
      deposit: { en: "Earnest Money", es: "Arras" },
    },
    team: {
      owner: { en: "Lead Agent", es: "Agente Principal" },
      member: { en: "Agent", es: "Agente" },
      members: { en: "Agents", es: "Agentes" },
      coordinator: { en: "Transaction Coordinator", es: "Coordinador de Transacciones" },
      planner: { en: "Listing Agent", es: "Agente de Listado" },
      assigned_to: { en: "Assigned Agent", es: "Agente Asignado" },
    }
  },

  // Education / Training
  education: {
    id: "education",
    name: { en: "Education & Training", es: "Educación y Capacitación" },
    description: { 
      en: "For schools, training centers, and educational institutions", 
      es: "Para escuelas, centros de capacitación e instituciones educativas" 
    },
    icon: "graduation-cap",
    events: {
      module_name: { en: "Course Management", es: "Gestión de Cursos" },
      entity_singular: { en: "Course", es: "Curso" },
      entity_plural: { en: "Courses", es: "Cursos" },
      client: { en: "Student", es: "Estudiante" },
      clients: { en: "Students", es: "Estudiantes" },
      lead: { en: "Prospective Student", es: "Estudiante Potencial" },
      leads: { en: "Prospective Students", es: "Estudiantes Potenciales" },
      guest: { en: "Parent/Guardian", es: "Padre/Tutor" },
      guests: { en: "Parents/Guardians", es: "Padres/Tutores" },
      venue: { en: "Campus", es: "Campus" },
      venues: { en: "Campuses", es: "Campus" },
      booking: { en: "Enrollment", es: "Inscripción" },
      bookings: { en: "Enrollments", es: "Inscripciones" },
      catering: { en: "Materials", es: "Materiales" },
      menu: { en: "Curriculum", es: "Currículo" },
      menus: { en: "Curriculums", es: "Currículos" },
      appointment: { en: "Class Date", es: "Fecha de Clase" },
      service: { en: "Educational Service", es: "Servicio Educativo" },
    },
    crm: {
      module_name: { en: "Student Relations", es: "Relaciones Estudiantiles" },
      pipeline: { en: "Enrollment Pipeline", es: "Pipeline de Inscripción" },
      deal: { en: "Enrollment", es: "Inscripción" },
      deals: { en: "Enrollments", es: "Inscripciones" },
      contact: { en: "Student", es: "Estudiante" },
      contacts: { en: "Students", es: "Estudiantes" },
    },
    finance: {
      module_name: { en: "Tuition & Fees", es: "Matrículas y Cuotas" },
      invoice: { en: "Tuition Invoice", es: "Factura de Matrícula" },
      invoices: { en: "Tuition Invoices", es: "Facturas de Matrícula" },
      quote: { en: "Tuition Estimate", es: "Presupuesto de Matrícula" },
      quotes: { en: "Tuition Estimates", es: "Presupuestos de Matrícula" },
      payment: { en: "Payment", es: "Pago" },
      deposit: { en: "Registration Fee", es: "Cuota de Inscripción" },
    },
    team: {
      owner: { en: "Program Director", es: "Director de Programa" },
      member: { en: "Instructor", es: "Instructor" },
      members: { en: "Instructors", es: "Instructores" },
      coordinator: { en: "Academic Coordinator", es: "Coordinador Académico" },
      planner: { en: "Curriculum Designer", es: "Diseñador de Currículo" },
      assigned_to: { en: "Assigned Instructor", es: "Instructor Asignado" },
    }
  },

  // Fitness / Wellness
  fitness: {
    id: "fitness",
    name: { en: "Fitness & Wellness", es: "Fitness y Bienestar" },
    description: { 
      en: "For gyms, wellness centers, and personal trainers", 
      es: "Para gimnasios, centros de bienestar y entrenadores personales" 
    },
    icon: "dumbbell",
    events: {
      module_name: { en: "Session Management", es: "Gestión de Sesiones" },
      entity_singular: { en: "Session", es: "Sesión" },
      entity_plural: { en: "Sessions", es: "Sesiones" },
      client: { en: "Member", es: "Miembro" },
      clients: { en: "Members", es: "Miembros" },
      lead: { en: "Prospect", es: "Prospecto" },
      leads: { en: "Prospects", es: "Prospectos" },
      guest: { en: "Guest Pass", es: "Invitado" },
      guests: { en: "Guest Passes", es: "Invitados" },
      venue: { en: "Facility", es: "Instalación" },
      venues: { en: "Facilities", es: "Instalaciones" },
      booking: { en: "Membership", es: "Membresía" },
      bookings: { en: "Memberships", es: "Membresías" },
      catering: { en: "Equipment", es: "Equipamiento" },
      menu: { en: "Training Plan", es: "Plan de Entrenamiento" },
      menus: { en: "Training Plans", es: "Planes de Entrenamiento" },
      appointment: { en: "Session Date", es: "Fecha de Sesión" },
      service: { en: "Fitness Service", es: "Servicio de Fitness" },
    },
    crm: {
      module_name: { en: "Member Relations", es: "Relaciones con Miembros" },
      pipeline: { en: "Member Journey", es: "Recorrido del Miembro" },
      deal: { en: "Membership", es: "Membresía" },
      deals: { en: "Memberships", es: "Membresías" },
      contact: { en: "Member", es: "Miembro" },
      contacts: { en: "Members", es: "Miembros" },
    },
    finance: {
      module_name: { en: "Billing", es: "Facturación" },
      invoice: { en: "Membership Invoice", es: "Factura de Membresía" },
      invoices: { en: "Membership Invoices", es: "Facturas de Membresía" },
      quote: { en: "Membership Quote", es: "Cotización de Membresía" },
      quotes: { en: "Membership Quotes", es: "Cotizaciones de Membresía" },
      payment: { en: "Payment", es: "Pago" },
      deposit: { en: "Joining Fee", es: "Cuota de Inscripción" },
    },
    team: {
      owner: { en: "Head Trainer", es: "Entrenador Principal" },
      member: { en: "Trainer", es: "Entrenador" },
      members: { en: "Trainers", es: "Entrenadores" },
      coordinator: { en: "Fitness Coordinator", es: "Coordinador de Fitness" },
      planner: { en: "Wellness Coach", es: "Coach de Bienestar" },
      assigned_to: { en: "Assigned Trainer", es: "Entrenador Asignado" },
    }
  },

  // Consulting
  consulting: {
    id: "consulting",
    name: { en: "Consulting", es: "Consultoría" },
    description: { 
      en: "For consulting firms and business advisors", 
      es: "Para firmas de consultoría y asesores de negocios" 
    },
    icon: "lightbulb",
    events: {
      module_name: { en: "Program Orchestration", es: "Orquestación de Programas" },
      entity_singular: { en: "Engagement", es: "Consultoría" },
      entity_plural: { en: "Engagements", es: "Consultorías" },
      client: { en: "Client", es: "Cliente" },
      clients: { en: "Clients", es: "Clientes" },
      lead: { en: "Opportunity", es: "Oportunidad" },
      leads: { en: "Opportunities", es: "Oportunidades" },
      guest: { en: "Participant", es: "Participante" },
      guests: { en: "Participants", es: "Participantes" },
      venue: { en: "Site", es: "Sitio" },
      venues: { en: "Sites", es: "Sitios" },
      booking: { en: "Contract", es: "Contrato" },
      bookings: { en: "Contracts", es: "Contratos" },
      catering: { en: "Deliverables", es: "Entregables" },
      menu: { en: "Scope", es: "Alcance" },
      menus: { en: "Scopes", es: "Alcances" },
      appointment: { en: "Meeting Date", es: "Fecha de Reunión" },
      service: { en: "Consulting Service", es: "Servicio de Consultoría" },
    },
    crm: {
      module_name: { en: "Client Engagement", es: "Gestión de Clientes" },
      pipeline: { en: "Opportunity Pipeline", es: "Pipeline de Oportunidades" },
      deal: { en: "Opportunity", es: "Oportunidad" },
      deals: { en: "Opportunities", es: "Oportunidades" },
      contact: { en: "Contact", es: "Contacto" },
      contacts: { en: "Contacts", es: "Contactos" },
    },
    finance: {
      module_name: { en: "Business Clarity", es: "Claridad de Negocio" },
      invoice: { en: "Invoice", es: "Factura" },
      invoices: { en: "Invoices", es: "Facturas" },
      quote: { en: "Statement of Work", es: "Propuesta de Trabajo" },
      quotes: { en: "Statements of Work", es: "Propuestas de Trabajo" },
      payment: { en: "Payment", es: "Pago" },
      deposit: { en: "Retainer", es: "Anticipo" },
    },
    team: {
      owner: { en: "Partner", es: "Socio/a" },
      member: { en: "Consultant", es: "Consultor/a" },
      members: { en: "Consultants", es: "Consultores" },
      coordinator: { en: "Engagement Manager", es: "Gerente de Consultoría" },
      planner: { en: "Senior Consultant", es: "Consultor/a Senior" },
      assigned_to: { en: "Assigned Consultant", es: "Consultor Asignado" },
    }
  },

  // Generic / Other
  generic: {
    id: "generic",
    name: { en: "General Services", es: "Servicios Generales" },
    description: { 
      en: "For general service-based businesses", 
      es: "Para negocios de servicios en general" 
    },
    icon: "briefcase",
    events: {
      module_name: { en: "Program Orchestration", es: "Orquestación de Programas" },
      entity_singular: { en: "Program", es: "Programa" },
      entity_plural: { en: "Programs", es: "Programas" },
      client: { en: "Client", es: "Cliente" },
      clients: { en: "Clients", es: "Clientes" },
      lead: { en: "Lead", es: "Prospecto" },
      leads: { en: "Leads", es: "Prospectos" },
      guest: { en: "Contact", es: "Contacto" },
      guests: { en: "Contacts", es: "Contactos" },
      venue: { en: "Location", es: "Ubicación" },
      venues: { en: "Locations", es: "Ubicaciones" },
      booking: { en: "Booking", es: "Reserva" },
      bookings: { en: "Bookings", es: "Reservas" },
      catering: { en: "Services", es: "Servicios" },
      menu: { en: "Package", es: "Paquete" },
      menus: { en: "Packages", es: "Paquetes" },
      appointment: { en: "Appointment Date", es: "Fecha de Cita" },
      service: { en: "Service", es: "Servicio" },
    },
    crm: {
      module_name: { en: "Client Engagement", es: "Gestión de Clientes" },
      pipeline: { en: "Sales Pipeline", es: "Pipeline de Ventas" },
      deal: { en: "Deal", es: "Negociación" },
      deals: { en: "Deals", es: "Negociaciones" },
      contact: { en: "Contact", es: "Contacto" },
      contacts: { en: "Contacts", es: "Contactos" },
    },
    finance: {
      module_name: { en: "Business Clarity", es: "Claridad de Negocio" },
      invoice: { en: "Invoice", es: "Factura" },
      invoices: { en: "Invoices", es: "Facturas" },
      quote: { en: "Quote", es: "Cotización" },
      quotes: { en: "Quotes", es: "Cotizaciones" },
      payment: { en: "Payment", es: "Pago" },
      deposit: { en: "Deposit", es: "Anticipo" },
    },
    team: {
      owner: { en: "Owner", es: "Propietario/a" },
      member: { en: "Team Member", es: "Miembro del Equipo" },
      members: { en: "Team Members", es: "Miembros del Equipo" },
      coordinator: { en: "Coordinator", es: "Coordinador/a" },
      planner: { en: "Manager", es: "Gerente" },
      assigned_to: { en: "Assigned To", es: "Asignado A" },
    }
  }
};

// List of available industries for UI selection
export const AVAILABLE_INDUSTRIES = [
  "events_hospitality",
  "professional_services",
  "healthcare",
  "real_estate",
  "education",
  "fitness",
  "consulting",
  "generic"
];

// Alias for backwards compatibility (agency -> professional_services)
export const INDUSTRY_ALIASES = {
  "agency": "professional_services"
};

// Fallback to generic if industry not found
export const getIndustryTerminology = (industry) => {
  return INDUSTRY_TERMINOLOGY[industry] || INDUSTRY_TERMINOLOGY.generic;
};

// Get industry info (name, description, icon)
export const getIndustryInfo = (industry, lang = "en") => {
  const terminology = getIndustryTerminology(industry);
  return {
    id: terminology.id || industry,
    name: terminology.name?.[lang] || terminology.name?.en || industry,
    description: terminology.description?.[lang] || terminology.description?.en || "",
    icon: terminology.icon || "briefcase"
  };
};

// Get a specific term for an industry
export const getTerm = (industry, category, key, lang = "en") => {
  const terminology = getIndustryTerminology(industry);
  const categoryTerms = terminology[category];
  if (categoryTerms && categoryTerms[key]) {
    return categoryTerms[key][lang] || categoryTerms[key].en || key;
  }
  return key;
};

// Get all terms for a category in an industry
export const getCategoryTerms = (industry, category, lang = "en") => {
  const terminology = getIndustryTerminology(industry);
  const categoryTerms = terminology[category];
  if (!categoryTerms) return {};
  
  const result = {};
  Object.entries(categoryTerms).forEach(([key, value]) => {
    if (typeof value === "object" && (value.en || value.es)) {
      result[key] = value[lang] || value.en || key;
    }
  });
  return result;
};

// Hook for using terminology in components
export const useIndustryTerms = (industry, language = "en") => {
  const terminology = getIndustryTerminology(industry);
  
  const t = (category, key) => {
    const categoryTerms = terminology[category];
    if (categoryTerms && categoryTerms[key]) {
      return categoryTerms[key][language] || categoryTerms[key].en || key;
    }
    return key;
  };
  
  // Get a flat object with all terms for a category
  const getCategory = (category) => getCategoryTerms(industry, category, language);
  
  // Get industry info
  const info = getIndustryInfo(industry, language);
  
  return { terminology, t, getCategory, info };
};

export default INDUSTRY_TERMINOLOGY;
