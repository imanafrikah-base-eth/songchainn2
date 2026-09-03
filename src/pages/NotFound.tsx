import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { Home, Music, Users, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    }
  }, [location.pathname]);

  /*
   * No auto-redirect.
   *
   * This page used to bounce to the home page on a timer. Nobody reads a
   * message, decides and taps a button in that window, so the buttons below
   * were decorative, and somebody following a shared link got flung somewhere
   * else before they understood what had happened. A 404 you cannot read is
   * worse than a 404. The buttons are the way out.
   */

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-md"
      >
        {/* Animated Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="w-24 h-24 mx-auto mb-8 rounded-full bg-primary/10 flex items-center justify-center"
        >
          <Music className="w-12 h-12 text-primary" />
        </motion.div>

        <h1 className="font-heading text-6xl font-bold text-foreground mb-4">404</h1>
        <h2 className="font-heading text-2xl font-semibold text-foreground mb-3">
          Page Not Found
        </h2>
        <p className="text-muted-foreground mb-8 leading-relaxed">
          Looks like this track got lost in the mix. The page you're looking for doesn't exist or may have been moved.
        </p>
        <p className="text-xs text-muted-foreground mb-6">
        </p>

        {/* Quick Links */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
          <Button asChild size="lg" className="gap-2">
            <Link to="/">
              <Home className="w-4 h-4" />
              Go Home
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="gap-2">
            <Link to="/artists">
              <Users className="w-4 h-4" />
              Browse Artists
            </Link>
          </Button>
        </div>

        {/* Back Button */}
        <button 
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Go back to previous page
        </button>
      </motion.div>
    </div>
  );
};

export default NotFound;
