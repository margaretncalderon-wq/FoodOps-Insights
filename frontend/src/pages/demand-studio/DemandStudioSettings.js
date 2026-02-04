import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Settings, Construction } from "lucide-react";

export default function DemandStudioSettings() {
  const { language } = useLanguage();
  const isEs = language === "es";

  return (
    <div className="space-y-6" data-testid="demand-studio-settings">
      <div>
        <h2 className="text-lg font-semibold">
          {isEs ? "Configuración de Demand Studio" : "Demand Studio Settings"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isEs ? "Personaliza tu módulo de marketing" : "Customize your marketing module"}
        </p>
      </div>

      <Card>
        <CardContent className="py-12 text-center">
          <Construction className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            {isEs ? "Próximamente" : "Coming Soon"}
          </h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            {isEs 
              ? "La configuración de Demand Studio estará disponible pronto. Aquí podrás personalizar categorías de canales, etiquetas, y más."
              : "Demand Studio settings will be available soon. Here you'll be able to customize channel categories, tags, and more."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
