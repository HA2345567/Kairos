import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";

const NotFound = () => {
  const location = useLocation();
  useEffect(() => {
    console.error("404:", location.pathname);
  }, [location.pathname]);

  return (
    <PageShell hideFooter>
      <div className="container flex min-h-[70vh] flex-col items-center justify-center text-center">
        <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Error 404</span>
        <h1 className="mt-4 font-display text-7xl tracking-tight text-gradient">Market not found</h1>
        <p className="mt-4 max-w-md text-muted-foreground">
          This route doesn't exist on the protocol. The market may have resolved or never been deployed.
        </p>
        <Link to="/" className="mt-8 inline-flex items-center gap-2 rounded-md bg-foreground px-5 py-2.5 text-sm font-semibold text-background shadow-button-inset">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>
      </div>
    </PageShell>
  );
};

export default NotFound;
