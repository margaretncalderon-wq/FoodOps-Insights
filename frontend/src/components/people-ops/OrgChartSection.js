import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Users, Building2, ChevronDown, ChevronRight, RefreshCw, User } from "lucide-react";
import { toast } from "sonner";

import { API_BASE as API } from "../../utils/api";

export function OrgChartSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [viewMode, setViewMode] = useState("hierarchy"); // hierarchy, department, flat
  const [expandedNodes, setExpandedNodes] = useState(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, deptRes] = await Promise.all([
        axios.get(`${API}/api/people-ops/employees`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/departments`, { withCredentials: true })
      ]);
      setEmployees(empRes.data.filter(e => e.status !== "terminated"));
      setDepartments(deptRes.data);
    } catch (error) {
      toast.error(isEs ? "Error al cargar datos" : "Error loading data");
    } finally {
      setLoading(false);
    }
  }, [isEs]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleNode = (id) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Build hierarchy tree
  const buildHierarchyTree = () => {
    const employeeMap = new Map();
    employees.forEach(emp => employeeMap.set(emp.employee_id, emp));
    
    // Find root employees (no manager or manager not in list)
    const roots = employees.filter(emp => 
      !emp.manager_id || !employeeMap.has(emp.manager_id)
    );
    
    // Build children map
    const childrenMap = new Map();
    employees.forEach(emp => {
      if (emp.manager_id) {
        if (!childrenMap.has(emp.manager_id)) {
          childrenMap.set(emp.manager_id, []);
        }
        childrenMap.get(emp.manager_id).push(emp);
      }
    });
    
    return { roots, childrenMap };
  };

  // Render employee card
  const EmployeeCard = ({ employee, level = 0, hasChildren = false }) => {
    const children = buildHierarchyTree().childrenMap.get(employee.employee_id) || [];
    const isExpanded = expandedNodes.has(employee.employee_id);
    const dept = departments.find(d => d.department_id === employee.department_id);
    
    return (
      <div className="relative" style={{ marginLeft: level > 0 ? '40px' : '0' }}>
        {level > 0 && (
          <div className="absolute -left-5 top-6 w-4 h-px bg-border" />
        )}
        <Card 
          className={`w-64 cursor-pointer transition-all hover:shadow-md ${
            children.length > 0 ? 'border-l-4 border-l-blue-500' : ''
          }`}
          onClick={() => children.length > 0 && toggleNode(employee.employee_id)}
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10">
                <AvatarImage src={employee.profile_photo} />
                <AvatarFallback className="bg-blue-100 text-blue-700">
                  {employee.full_name?.split(' ').map(n => n[0]).join('').slice(0,2)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{employee.full_name}</div>
                <div className="text-xs text-muted-foreground truncate">{employee.job_title}</div>
                {dept && (
                  <Badge variant="outline" className="mt-1 text-xs">
                    {dept.name}
                  </Badge>
                )}
              </div>
              {children.length > 0 && (
                <div className="text-muted-foreground">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
              )}
            </div>
            {children.length > 0 && (
              <div className="text-xs text-muted-foreground mt-2 border-t pt-2">
                {children.length} {isEs ? "reportes directos" : "direct reports"}
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Children */}
        {isExpanded && children.length > 0 && (
          <div className="mt-2 pl-2 border-l border-border space-y-2">
            {children.map(child => (
              <EmployeeCard 
                key={child.employee_id} 
                employee={child} 
                level={level + 1}
                hasChildren={(buildHierarchyTree().childrenMap.get(child.employee_id) || []).length > 0}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  // Render department view
  const DepartmentView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {departments.filter(d => d.is_active).map(dept => {
        const deptEmployees = employees.filter(e => e.department_id === dept.department_id);
        const head = employees.find(e => e.employee_id === dept.head_user_id || e.user_id === dept.head_user_id);
        
        return (
          <Card key={dept.department_id} className="overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                {dept.name}
                {dept.code && <span className="text-xs text-muted-foreground">({dept.code})</span>}
              </CardTitle>
              {head && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="w-3 h-3" />
                  {head.full_name} ({isEs ? "Responsable" : "Head"})
                </div>
              )}
            </CardHeader>
            <CardContent className="p-3">
              <div className="text-sm text-muted-foreground mb-2">
                {deptEmployees.length} {isEs ? "empleados" : "employees"}
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {deptEmployees.map(emp => (
                  <div key={emp.employee_id} className="flex items-center gap-2 py-1">
                    <Avatar className="w-6 h-6">
                      <AvatarImage src={emp.profile_photo} />
                      <AvatarFallback className="text-xs">
                        {emp.full_name?.split(' ').map(n => n[0]).join('').slice(0,2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{emp.full_name}</div>
                      <div className="text-xs text-muted-foreground truncate">{emp.job_title}</div>
                    </div>
                  </div>
                ))}
                {deptEmployees.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    {isEs ? "Sin empleados asignados" : "No employees assigned"}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
      
      {/* Unassigned employees */}
      {(() => {
        const unassigned = employees.filter(e => !e.department_id);
        if (unassigned.length === 0) return null;
        
        return (
          <Card className="border-dashed">
            <CardHeader className="bg-gray-50 pb-3">
              <CardTitle className="text-base text-muted-foreground">
                {isEs ? "Sin Departamento" : "Unassigned"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {unassigned.map(emp => (
                  <div key={emp.employee_id} className="flex items-center gap-2 py-1">
                    <Avatar className="w-6 h-6">
                      <AvatarFallback className="text-xs">
                        {emp.full_name?.split(' ').map(n => n[0]).join('').slice(0,2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{emp.full_name}</div>
                      <div className="text-xs text-muted-foreground truncate">{emp.job_title}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { roots, childrenMap } = buildHierarchyTree();

  return (
    <div className="space-y-6" data-testid="org-chart-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Users className="w-5 h-5" />
            {isEs ? "Organigrama" : "Organization Chart"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {employees.length} {isEs ? "empleados" : "employees"} • {departments.length} {isEs ? "departamentos" : "departments"}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Select value={viewMode} onValueChange={setViewMode}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hierarchy">{isEs ? "Jerarquía" : "Hierarchy"}</SelectItem>
              <SelectItem value="department">{isEs ? "Por Departamento" : "By Department"}</SelectItem>
            </SelectContent>
          </Select>
          
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">{isEs ? "Total Empleados" : "Total Employees"}</div>
            <div className="text-2xl font-bold">{employees.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">{isEs ? "Departamentos" : "Departments"}</div>
            <div className="text-2xl font-bold">{departments.filter(d => d.is_active).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">{isEs ? "Con Manager" : "With Manager"}</div>
            <div className="text-2xl font-bold">{employees.filter(e => e.manager_id).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">{isEs ? "Sin Asignar" : "Unassigned"}</div>
            <div className="text-2xl font-bold text-orange-600">
              {employees.filter(e => !e.department_id).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      {viewMode === "hierarchy" ? (
        <div className="space-y-4">
          {roots.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>{isEs ? "No hay empleados con estructura jerárquica" : "No employees with hierarchy structure"}</p>
                <p className="text-sm mt-1">
                  {isEs ? "Asigna managers en los perfiles de empleados" : "Assign managers in employee profiles"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {roots.map(emp => (
                <EmployeeCard 
                  key={emp.employee_id} 
                  employee={emp}
                  hasChildren={(childrenMap.get(emp.employee_id) || []).length > 0}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <DepartmentView />
      )}
    </div>
  );
}
