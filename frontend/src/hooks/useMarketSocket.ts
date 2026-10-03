import { useEffect, useState, useRef } from 'react';

interface OrderbookEntry {
  price: number;
  size: number;
}

interface MarketMessage {
  type: 'price';
  yesPrice: number;
  noPrice: number;
  orderbook: {
    buyYes: OrderbookEntry[];
    sellYes: OrderbookEntry[];
  };
  ts: string;
}

export function useMarketSocket(marketId: string | undefined) {
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [orderbook, setOrderbook] = useState<{ buyYes: OrderbookEntry[]; sellYes: OrderbookEntry[] } | null>(null);
  const [lastSocialEvent, setLastSocialEvent] = useState<any>(null);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!marketId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    // In dev, apiBaseUrl is usually http://localhost:3001
    // We want ws://localhost:3001
    const base = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace("http", "ws");
    const url = `${base}/ws/${marketId}`;

    console.log(`Connecting to WebSocket: ${url}`);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('open');
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data: any = JSON.parse(event.data);
        if (data.type === 'price') {
          setLivePrice(data.yesPrice);
          setOrderbook(data.orderbook);
        } else {
          // Captures trade, comment, and other social events
          setLastSocialEvent(data);
        }
      } catch (e) {
        console.error('WebSocket parse error:', e);
      }
    };

    ws.onclose = () => {
      setStatus('closed');
      console.log('WebSocket closed');
    };

    ws.onerror = () => {
      setStatus('error');
      console.error('WebSocket error');
    };

    return () => {
      ws.close();
    };
  }, [marketId]);

  return { livePrice, orderbook, status, lastSocialEvent };
}
