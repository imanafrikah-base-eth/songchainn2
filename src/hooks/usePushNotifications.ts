import { useState, useEffect, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';

const VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    const checkSupport = async () => {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      setIsSupported(supported);
      
      if (supported) {
        setPermission(Notification.permission);
        
        // Check existing subscription
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          const subscription = await registration.pushManager.getSubscription();
          setIsSubscribed(!!subscription);
        }
      }
    };

    checkSupport();
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      toast({
        title: 'Not Supported',
        description: 'Push notifications are not supported in this browser.',
        variant: 'destructive'
      });
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      
      if (result === 'granted') {
        toast({
          title: 'Notifications Enabled',
          description: 'You will now receive push notifications.'
        });
        return true;
      } else if (result === 'denied') {
        toast({
          title: 'Notifications Blocked',
          description: 'Please enable notifications in your browser settings.',
          variant: 'destructive'
        });
      }
      return false;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error requesting notification permission:', error);
      }
      return false;
    }
  }, [isSupported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    try {
      // Register service worker if not already registered
      let registration = await navigator.serviceWorker.getRegistration();
      
      if (!registration) {
        registration = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
      }

      // Check permission
      if (Notification.permission !== 'granted') {
        const granted = await requestPermission();
        if (!granted) return false;
      }

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      // Store subscription in localStorage (in a real app, send to server)
      localStorage.setItem('pushSubscription', JSON.stringify(subscription));
      setIsSubscribed(true);
      
      toast({
        title: 'Subscribed!',
        description: 'You will receive notifications for likes, comments, and follows.'
      });
      
      return true;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error subscribing to push:', error);
      }
      toast({
        title: 'Subscription Failed',
        description: 'Could not subscribe to notifications.',
        variant: 'destructive'
      });
      return false;
    }
  }, [isSupported, requestPermission]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
        }
      }
      
      localStorage.removeItem('pushSubscription');
      setIsSubscribed(false);
      
      toast({
        title: 'Unsubscribed',
        description: 'You will no longer receive push notifications.'
      });
      
      return true;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error unsubscribing:', error);
      }
      return false;
    }
  }, []);

  const showLocalNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (permission === 'granted') {
      new Notification(title, {
        icon: '/favicon.png',
        badge: '/favicon.png',
        ...options
      });
    }
  }, [permission]);

  return {
    isSupported,
    isSubscribed,
    permission,
    requestPermission,
    subscribe,
    unsubscribe,
    showLocalNotification
  };
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}
