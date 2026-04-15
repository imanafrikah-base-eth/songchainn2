import { useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Music, Users, Upload, Edit, Trash2, Plus, Save, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ARTISTS, SONGS, Artist, Song } from '@/data/musicData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { useSongPopularity } from '@/hooks/usePopularity';
const logo = '/songchainn-logo.webp';

// Simulated admin authentication
const ADMIN_PASSWORD = 'songchainn-admin-2024';

export default function Admin() {
  const { isAdmin } = useAuth();
  const { data: popularityData } = useSongPopularity();
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState<'artists' | 'songs'>('artists');
  const [editingArtist, setEditingArtist] = useState<Artist | null>(null);
  const [artists, setArtists] = useState(ARTISTS);
  
  // Merge songs with real database stats
  const songsWithRealStats = useMemo(() => {
    return SONGS.map(song => {
      const dbData = popularityData?.find(p => p.song_id === song.id);
      return {
        ...song,
        plays: dbData?.play_count || 0,
        likes: dbData?.like_count || 0,
      };
    });
  }, [popularityData]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setIsAdminMode(true);
      setLoginError('');
    } else {
      setLoginError('Access Restricted');
    }
  };

  const handleLogout = () => {
    setIsAdminMode(false);
    setPassword('');
  };

  // If not admin, show login gate
  if (!isAdminMode && !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-sm w-full"
        >
          <div className="text-center mb-8">
            <img src={logo} alt="$ongChainn" className="w-16 h-16 mx-auto mb-4" />
            <h1 className="font-heading text-2xl font-bold text-foreground mb-2">
              Admin Access
            </h1>
            <p className="text-sm text-muted-foreground">
              This area is restricted to authorized administrators only.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Input
                type="password"
                placeholder="Admin Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-card border-border"
              />
            </div>
            
            {loginError && (
              <p className="text-destructive text-sm text-center">{loginError}</p>
            )}

            <Button type="submit" className="w-full gradient-primary">
              <Shield className="w-4 h-4 mr-2" />
              Access Admin Panel
            </Button>
          </form>

          <p className="mt-6 text-xs text-center text-muted-foreground">
            If you're seeing this page by mistake,{' '}
            <a href="/" className="text-primary hover:underline">return to home</a>.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Admin Header */}
      <header className="bg-card border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="$ongChainn" className="w-8 h-8" />
            <div>
              <span className="font-heading font-bold text-foreground">$ongChainn</span>
              <span className="text-xs text-destructive ml-2 font-medium">Admin</span>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="font-heading text-3xl font-bold text-foreground mb-2">
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground mb-8">
            Manage artists, songs, and Town Square content.
          </p>

          {/* Tabs */}
          <div className="flex gap-2 mb-8">
            <button
              onClick={() => setActiveTab('artists')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                activeTab === 'artists' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              <Users className="w-4 h-4 inline mr-2" />
              Artists ({artists.length})
            </button>
            <button
              onClick={() => setActiveTab('songs')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                activeTab === 'songs' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              <Music className="w-4 h-4 inline mr-2" />
              Songs ({songsWithRealStats.length})
            </button>
          </div>

          {/* Artists Tab */}
          {activeTab === 'artists' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="font-heading text-xl font-semibold text-foreground">
                  Manage Artists
                </h2>
                <Button size="sm" className="gradient-primary" onClick={() => toast({ title: 'Add Artist', description: 'Artist management coming in next update.' })}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Artist
                </Button>
              </div>

              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <table className="w-full">
                  <thead className="bg-secondary/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Artist</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Location</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Town Square</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Songs</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {artists.map((artist) => (
                      <tr key={artist.id} className="hover:bg-secondary/20">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                              <span className="font-heading font-bold text-foreground">
                                {artist.name.charAt(0)}
                              </span>
                            </div>
                            <span className="font-medium text-foreground">{artist.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{artist.location}</td>
                        <td className="px-4 py-3 text-muted-foreground text-sm">{artist.townSquare}</td>
                        <td className="px-4 py-3 text-muted-foreground">{artist.songs.length}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => toast({ title: 'Edit Artist', description: 'Artist editing coming soon.' })}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => toast({ title: 'Delete Artist', description: 'Artist deletion coming soon.', variant: 'destructive' })}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Songs Tab */}
          {activeTab === 'songs' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="font-heading text-xl font-semibold text-foreground">
                  Manage Songs
                </h2>
                <Button size="sm" className="gradient-primary" onClick={() => toast({ title: 'Upload Song', description: 'Song upload coming in next update.' })}>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Song
                </Button>
              </div>

              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <table className="w-full">
                  <thead className="bg-secondary/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Title</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Artist</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Plays</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Likes</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {songsWithRealStats.map((song) => (
                      <tr key={song.id} className="hover:bg-secondary/20">
                        <td className="px-4 py-3 font-medium text-foreground">{song.title}</td>
                        <td className="px-4 py-3 text-muted-foreground">{song.artist}</td>
                        <td className="px-4 py-3 text-muted-foreground">{song.plays.toLocaleString()}</td>
                        <td className="px-4 py-3 text-muted-foreground">{song.likes.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => toast({ title: 'Edit Song', description: 'Song editing coming soon.' })}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => toast({ title: 'Delete Song', description: 'Song deletion coming soon.', variant: 'destructive' })}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
