import React, { useState, useEffect, useRef } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  Target,
  BarChart3,
  Zap,
  Volume2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

const TradingDashboard = () => {
  // FOR checking the connection
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [connectionError, setConnectionError] = useState('');

  // FOR positions storing
  const [positions, setPositions] = useState([]);

  // FOR storing the openPosition
  const [openingOrders, setOpeningOrders] = useState([]);
  const [openingOrdersQty, setOpeningOrdersQty] = useState(0);

  // FOR storing the closePosition
  const [closingOrders, setClosingOrders] = useState([]);
  const [closingOrdersQty, setClosingOrdersQty] = useState(0);

  // For temp PF orders and OrderID
  const [tempOrders, setTempOrders] = useState(null);
  const [orderIDs, setOrderIDs] = useState(null);

  const [completedTrades, setCompletedTrades] = useState([]);

  const [metrics, setMetrics] = useState({
    totalTrades: 0,
    winCount: 0,
    lossCount: 0,
    totalPnL: 0,
    avgWin: 0,
    avgLoss: 0,
    winRate: 0,
  });

  const [lastUpdate, setLastUpdate] = useState(null);

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const maxReconnectAttempts = 5;
  const reconnectAttemptRef = useRef(0);

  // Bybit creds
  const API_KEY = import.meta.env.VITE_API_KEY;
  const API_SECRET = import.meta.env.VITE_API_SECRET;

  // --- helpers ---
  const parseNumber = (v) => {
    if (v === undefined || v === null || v === '') return 0;
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };

  const isClosingByPosition = (orderSide, symbol) => {
    try {
      const pos = positions.find(
        (p) => (p.symbol || '').toString() === (symbol || '').toString()
      );
      if (!pos) return null;
      const posSize = parseNumber(pos.size);
      if (posSize > 0 && orderSide.toLowerCase() === 'sell') return true;
      if (posSize < 0 && orderSide.toLowerCase() === 'buy') return true;
      return false;
    } catch {
      return null;
    }
  };

  const calculateQtyMatches = (projectedOpenQty, projectedCloseQty) => {
    const openQ = Number(projectedOpenQty || 0);
    const closeQ = Number(projectedCloseQty || 0);
    return openQ > 0 && closeQ > 0 && Math.abs(openQ - closeQ) < 1e-8;
  };

  // --- summary ---
  const computeSummary = (tradeSummary) => {
    setCompletedTrades((prev) => [...prev, tradeSummary]);
    setOpeningOrders([]);
    setClosingOrders([]);
    setOpeningOrdersQty(0);
    setClosingOrdersQty(0);
    setTempOrders(null);
    setOrderIDs(null);
    calculateMatrix(tradeSummary);
  };

  const calculateMatrix = (tradeSummary) => {
    setMetrics((prev) => {
      const totalTrades = prev.totalTrades + 1;
      const winCount = prev.winCount + (tradeSummary.realizedPnL > 0 ? 1 : 0);
      const lossCount = prev.lossCount + (tradeSummary.realizedPnL < 0 ? 1 : 0);
      const totalPnL = prev.totalPnL + (tradeSummary.realizedPnL || 0);
      const avgWin =
        winCount > 0
          ? totalPnL / winCount
          : 0; /* simplification: per-win average could be refined */
      const avgLoss =
        lossCount > 0 ? Math.abs(totalPnL) / lossCount : 0;
      const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;
      return {
        totalTrades,
        winCount,
        lossCount,
        totalPnL,
        avgWin,
        avgLoss,
        winRate,
      };
    });
  };

  // --- main processor ---
  const processOrderUpdate = (orders) => {
    console.log(`Processing ${orders.length} order updates`);
    orders.forEach((orderDataRaw) => {
      const orderData = orderDataRaw || {};
      const statusRaw = (orderData.orderStatus || '').toString();
      const status = statusRaw.toLowerCase();
      const qty = parseNumber(orderData.cumExecQty || orderData.qty);
      const closedPnl = parseNumber(orderData.closedPnl);
      const reduceOnly = !!orderData.reduceOnly;
      const side = (orderData.side || '').toString();
      const symbol = (orderData.symbol || '').toString();

      const isFilled = status.includes('fill') && !status.includes('partial');
      const isPartial =
        status.includes('partial') || status.includes('partially');

      let classifiedAsClosing = false;
      if (reduceOnly) classifiedAsClosing = true;
      else if (Math.abs(closedPnl) > 1e-12) classifiedAsClosing = true;
      else {
        const posDecision = isClosingByPosition(side, symbol);
        if (posDecision === true) classifiedAsClosing = true;
        else if (posDecision === false) classifiedAsClosing = false;
        else classifiedAsClosing = false; // fallback
      }

      if (isFilled) {
        const currentOpenQty = Number(openingOrdersQty || 0);
        const currentCloseQty = Number(closingOrdersQty || 0);

        if (classifiedAsClosing) {
          let newClosing = [];
          if (orderIDs && orderIDs === orderData.orderId && tempOrders) {
            newClosing = [...closingOrders, tempOrders, orderData];
          } else {
            newClosing = [...closingOrders, orderData];
          }
          const tempQty =
            orderIDs === orderData.orderId && tempOrders
              ? parseNumber(tempOrders.qty || tempOrders.cumExecQty)
              : 0;
          const newClosingQty = currentCloseQty + qty + tempQty;
          setClosingOrders(newClosing);
          setClosingOrdersQty(newClosingQty);
          setTempOrders(null);
          setOrderIDs(null);

          if (calculateQtyMatches(currentOpenQty, newClosingQty)) {
            const totalOpenQty = openingOrders.reduce(
              (acc, o) => acc + parseNumber(o.cumExecQty || o.qty),
              0
            );
            const openExecSum = openingOrders.reduce((acc, o) => {
              const ev = parseNumber(o.cumExecValue);
              if (ev !== 0) return acc + ev;
              return (
                acc +
                parseNumber(o.cumExecQty || o.qty) *
                  parseNumber(o.avgPrice || o.price)
              );
            }, 0);
            const EntryPrice =
              totalOpenQty > 0 ? openExecSum / totalOpenQty : 0;

            const totalCloseQty = newClosing.reduce(
              (acc, o) => acc + parseNumber(o.cumExecQty || o.qty),
              0
            );
            const closeExecSum = newClosing.reduce((acc, o) => {
              const ev = parseNumber(o.cumExecValue);
              if (ev !== 0) return acc + ev;
              return (
                acc +
                parseNumber(o.cumExecQty || o.qty) *
                  parseNumber(o.avgPrice || o.price)
              );
            }, 0);
            const ExitPrice =
              totalCloseQty > 0 ? closeExecSum / totalCloseQty : 0;

            const realizedPnL = newClosing.reduce(
              (acc, o) => acc + parseNumber(o.closedPnl),
              0
            );

            computeSummary({
              symbol,
              time: orderData.createdTime || Date.now(),
              EntryPrice,
              ExitPrice,
              realizedPnL,
            });
          }
        } else {
          let newOpening = [];
          if (orderIDs && orderIDs === orderData.orderId && tempOrders) {
            newOpening = [...openingOrders, tempOrders, orderData];
          } else {
            newOpening = [...openingOrders, orderData];
          }
          const tempQty =
            orderIDs === orderData.orderId && tempOrders
              ? parseNumber(tempOrders.qty || tempOrders.cumExecQty)
              : 0;
          const newOpeningQty = currentOpenQty + qty + tempQty;
          setOpeningOrders(newOpening);
          setOpeningOrdersQty(newOpeningQty);

          if (calculateQtyMatches(newOpeningQty, currentCloseQty)) {
            const totalOpenQty = newOpening.reduce(
              (acc, o) => acc + parseNumber(o.cumExecQty || o.qty),
              0
            );
            const openExecSum = newOpening.reduce((acc, o) => {
              const ev = parseNumber(o.cumExecValue);
              if (ev !== 0) return acc + ev;
              return (
                acc +
                parseNumber(o.cumExecQty || o.qty) *
                  parseNumber(o.avgPrice || o.price)
              );
            }, 0);
            const EntryPrice =
              totalOpenQty > 0 ? openExecSum / totalOpenQty : 0;

            const totalCloseQty = closingOrders.reduce(
              (acc, o) => acc + parseNumber(o.cumExecQty || o.qty),
              0
            );
            const closeExecSum = closingOrders.reduce((acc, o) => {
              const ev = parseNumber(o.cumExecValue);
              if (ev !== 0) return acc + ev;
              return (
                acc +
                parseNumber(o.cumExecQty || o.qty) *
                  parseNumber(o.avgPrice || o.price)
              );
            }, 0);
            const ExitPrice =
              totalCloseQty > 0 ? closeExecSum / totalCloseQty : 0;

            const realizedPnL = closingOrders.reduce(
              (acc, o) => acc + parseNumber(o.closedPnl),
              0
            );

            computeSummary({
              symbol,
              time: orderData.createdTime || Date.now(),
              EntryPrice,
              ExitPrice,
              realizedPnL,
            });
          }
        }
      } else if (isPartial) {
        setTempOrders(orderData);
        setOrderIDs(orderData.orderId);
      }
    });
  };

  // process position updates
  const processPositionUpdate = (positionData) => {
    const activePositions = positionData.filter(
      (pos) => Math.abs(parseNumber(pos.size)) > 0
    );
    setPositions(activePositions);
  };

  // --- websocket connection ---
  const generateSignature = async (apiSecret, expires) => {
    const encoder = new TextEncoder();
    const message = `GET/realtime${expires}`;
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(apiSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(message)
    );
    return Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const connectWebSocket = async () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (!API_KEY || !API_SECRET) {
      setConnectionStatus('error');
      setConnectionError('API credentials not configured');
      return;
    }
    const url = import.meta.env.VITE_WS_URL;
    wsRef.current = new WebSocket(url);
    wsRef.current.onopen = async () => {
      setConnectionStatus('connected');
      const expires = Date.now() + 10000;
      const signature = await generateSignature(API_SECRET, expires);
      wsRef.current.send(
        JSON.stringify({ op: 'auth', args: [API_KEY, expires, signature] })
      );
    };
    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.op === 'auth' && data.success) {
        wsRef.current.send(
          JSON.stringify({ op: 'subscribe', args: ['order', 'position'] })
        );
      } else if (data.topic === 'order') {
        const payload = Array.isArray(data.data) ? data.data : [data.data];
        processOrderUpdate(payload);
      } else if (data.topic === 'position') {
        const payload = Array.isArray(data.data) ? data.data : [data.data];
        processPositionUpdate(payload);
      }
      setLastUpdate(new Date());
    };
  };

  useEffect(() => {
    if (API_KEY && API_SECRET) connectWebSocket();
    return () => {
      if (reconnectTimeoutRef.current)
        clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [API_KEY, API_SECRET]);

  // --- UI helpers ---
  const getSideColor = (side) =>
    side?.toLowerCase() === 'buy'
      ? 'text-green-600 bg-green-100'
      : 'text-red-600 bg-red-100';
  const formatNumber = (num, d = 2) => parseNumber(num).toFixed(d);
  const formatCurrency = (num) =>
    `$${parseNumber(num).toFixed(2)}`;

  // --- render ---
  return (
    <div className="w-screen min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* debug section */}
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-medium text-blue-800 mb-2">Debug</h3>
          <div className="grid grid-cols-2 gap-4 text-sm text-blue-700">
            <div>Open Orders: {openingOrders.length}</div>
            <div>Open Qty: {openingOrdersQty}</div>
            <div>Close Orders: {closingOrders.length}</div>
            <div>Close Qty: {closingOrdersQty}</div>
            <div>Completed: {completedTrades.length}</div>
          </div>
        </div>

        {/* metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <BarChart3 className="w-4 h-4 text-blue-600" />
            <p>Total Trades: {metrics.totalTrades}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <TrendingUp className="w-4 h-4 text-green-600" />
            <p>Wins: {metrics.winCount}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <TrendingDown className="w-4 h-4 text-red-600" />
            <p>Losses: {metrics.lossCount}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <Target className="w-4 h-4 text-purple-600" />
            <p>WinRate: {formatNumber(metrics.winRate, 1)}%</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <DollarSign className="w-4 h-4 text-blue-600" />
            <p>PnL: {formatCurrency(metrics.totalPnL)}</p>
          </div>
        </div>

        {/* completed trades */}
        <div className="mt-8 bg-white rounded-xl shadow-sm border">
          <h2 className="p-6 border-b text-xl">Completed Trades</h2>
          <div className="p-6">
            {completedTrades.length === 0 ? (
              <div>No trades yet</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Time</th>
                    <th>Entry</th>
                    <th>Exit</th>
                    <th>PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {completedTrades.map((t, i) => (
                    <tr key={i}>
                      <td>{t.symbol}</td>
                      <td>
                        {t.time
                          ? new Date(Number(t.time)).toLocaleString()
                          : '-'}
                      </td>
                      <td>{formatCurrency(t.EntryPrice)}</td>
                      <td>{formatCurrency(t.ExitPrice)}</td>
                      <td
                        className={
                          t.realizedPnL >= 0
                            ? 'text-green-600'
                            : 'text-red-600'
                        }
                      >
                        {formatCurrency(t.realizedPnL)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradingDashboard;
