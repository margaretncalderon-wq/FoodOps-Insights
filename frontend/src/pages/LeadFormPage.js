import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { toast } from "sonner";
import { CheckCircle, Loader2, Calendar, Users, Mail, Phone, Building2, User } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const EVENT_TYPES = ["wedding", "corporate", "birthday", "social", "other"];

export default function LeadFormPage() {
  const { formId } = useParams();
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    lead_name: "",
    email: "",
    phone: "",
    company_name: "",
    event_type: "",
    event_date: "",
    estimated_guest_count: "",
    budget_range: "",
    message: ""
  });

  useEffect(() => {
    fetchForm();
  }, [formId]);

  const fetchForm = async () => {
    try {
      const response = await axios.get(`${API}/lead-forms/${formId}/public`);
      setForm(response.data);
      if (response.data.default_event_type) {
        setFormData(prev => ({ ...prev, event_type: response.data.default_event_type }));
      }
    } catch (error) {
      console.error("Failed to fetch form:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const response = await axios.post(`${API}/lead-forms/${formId}/submit`, formData);
      setSubmitted(true);
      toast.success(response.data.message || "Thank you for your inquiry!");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to submit form");
    } finally {
      setSubmitting(false);
    }
  };

  const isFieldEnabled = (fieldName) => {
    if (!form?.fields || form.fields.length === 0) return true;
    const field = form.fields.find(f => f.field_name === fieldName);
    return field ? field.enabled : true;
  };

  const isFieldRequired = (fieldName) => {
    if (!form?.fields || form.fields.length === 0) {
      return ["lead_name", "email"].includes(fieldName);
    }
    const field = form.fields.find(f => f.field_name === fieldName);
    return field ? field.required : false;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Form not found or inactive</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Thank You!</h2>
            <p className="text-muted-foreground">{form.thank_you_message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl">{form.form_name}</CardTitle>
          {form.description && (
            <CardDescription className="mt-2">{form.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            {isFieldEnabled("lead_name") && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Full Name {isFieldRequired("lead_name") && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  value={formData.lead_name}
                  onChange={(e) => setFormData({ ...formData, lead_name: e.target.value })}
                  required={isFieldRequired("lead_name")}
                  placeholder="Your full name"
                />
              </div>
            )}

            {/* Email */}
            {isFieldEnabled("email") && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email {isFieldRequired("email") && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required={isFieldRequired("email")}
                  placeholder="your@email.com"
                />
              </div>
            )}

            {/* Phone */}
            {isFieldEnabled("phone") && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  Phone {isFieldRequired("phone") && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required={isFieldRequired("phone")}
                  placeholder="+1 (555) 000-0000"
                />
              </div>
            )}

            {/* Company */}
            {isFieldEnabled("company_name") && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Company {isFieldRequired("company_name") && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  required={isFieldRequired("company_name")}
                  placeholder="Company name (optional)"
                />
              </div>
            )}

            {/* Event Type */}
            {isFieldEnabled("event_type") && (
              <div className="space-y-2">
                <Label>
                  Event Type {isFieldRequired("event_type") && <span className="text-red-500">*</span>}
                </Label>
                <Select 
                  value={formData.event_type} 
                  onValueChange={(v) => setFormData({ ...formData, event_type: v })}
                  required={isFieldRequired("event_type")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select event type" />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map(type => (
                      <SelectItem key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Event Date */}
            {isFieldEnabled("event_date") && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Event Date {isFieldRequired("event_date") && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  type="date"
                  value={formData.event_date}
                  onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                  required={isFieldRequired("event_date")}
                />
              </div>
            )}

            {/* Guest Count */}
            {isFieldEnabled("estimated_guest_count") && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Estimated Guests {isFieldRequired("estimated_guest_count") && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  type="number"
                  value={formData.estimated_guest_count}
                  onChange={(e) => setFormData({ ...formData, estimated_guest_count: e.target.value })}
                  required={isFieldRequired("estimated_guest_count")}
                  placeholder="Number of guests"
                />
              </div>
            )}

            {/* Budget Range */}
            {isFieldEnabled("budget_range") && (
              <div className="space-y-2">
                <Label>
                  Budget Range {isFieldRequired("budget_range") && <span className="text-red-500">*</span>}
                </Label>
                <Select 
                  value={formData.budget_range} 
                  onValueChange={(v) => setFormData({ ...formData, budget_range: v })}
                  required={isFieldRequired("budget_range")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select budget range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="< $5,000">Less than $5,000</SelectItem>
                    <SelectItem value="$5,000 - $10,000">$5,000 - $10,000</SelectItem>
                    <SelectItem value="$10,000 - $25,000">$10,000 - $25,000</SelectItem>
                    <SelectItem value="$25,000 - $50,000">$25,000 - $50,000</SelectItem>
                    <SelectItem value="> $50,000">More than $50,000</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Message */}
            {isFieldEnabled("message") && (
              <div className="space-y-2">
                <Label>
                  Message {isFieldRequired("message") && <span className="text-red-500">*</span>}
                </Label>
                <Textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  required={isFieldRequired("message")}
                  placeholder="Tell us more about your event..."
                  rows={4}
                />
              </div>
            )}

            <Button type="submit" className="w-full h-12" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Inquiry"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
