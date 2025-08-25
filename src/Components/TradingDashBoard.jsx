import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, Activity, DollarSign, Target, BarChart3, Zap, Volume2, ArrowUp, ArrowDown } from 'lucide-react';
import LivePositionsREST from './LivePositionsREST';

const TradingDashboard = () => {
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [connectionError, setConnectionError] = useState('');
  
  const [serverStatus, setServerStatus] = useState(null);
  const [positions, setPositions] = useState([]);
  const [openingOrders, setOpeningOrders] = useState([]);
  const [closingOrders, setClosingOrders] = useState([]);
  const [completedTrades, setCompletedTrades] = useState([]);
  const [metrics, setMetrics] = useState({
    totalTrades: 0,
    winCount: 0,
    lossCount: 0,
    totalPnL: 0,
    avgWin: 0,
    avgLoss: 0,
    winRate: 0,
    totalVolumeTraded: 0
  });
  const [lastUpdate, setLastUpdate] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const maxReconnectAttempts = 5;
  const reconnectAttemptRef = useRef(0);

  // Multiple WebSocket URLs to try
  const getWebSocketUrls = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname;

    return [
      'ws://localhost:3001',           // Localhost
      'ws://127.0.0.1:3001',          // IP address
      `${protocol}//${hostname}:3001`,  // Same hostname as frontend
      'ws://0.0.0.0:3001'             // All interfaces
    ];
  };

  // Test server connection first
  const testServerConnection = async () => {
    const testUrls = [
      `${window.location.protocol}//${window.location.hostname}:3001/test`,
      'http://localhost:3001/test',
      'http://127.0.0.1:3001/test'
    ];

    for (const url of testUrls) {
      try {
        console.log(`🧪 Testing server connection to: ${url}`);
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          setServerStatus('connected');
          console.log('✅ Server is running:', data);
          return true;
        }
      } catch (error) {
        console.log(`❌ Failed to connect to ${url}:`, error.message);
      }
    }

    setServerStatus('error');
    setConnectionError('Cannot reach server on any URL');
    console.error('❌ All server connection attempts failed');
    return false;
  };

  const connectWebSocket = async (urlIndex = 0) => {

    
    const wsUrls = getWebSocketUrls();

    try {

      // wsRef.current= new WebSocket("ws://localhost:3001")
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      // Test server first if it's the first attempt
      if (urlIndex === 0) {
        const serverOk = await testServerConnection();
        if (!serverOk) {
          console.log('❌ Server not available, will retry in 5 seconds');
          setTimeout(() => {
            reconnectAttemptRef.current++;
            if (reconnectAttemptRef.current < maxReconnectAttempts) {
              setConnectionStatus('connecting');
              connectWebSocket(0);
            } else {
              setConnectionStatus('error');
              setConnectionError('Max reconnection attempts reached');
            }
          }, 5000);
          return;
        }
      }

      if (urlIndex >= wsUrls.length) {
        setConnectionStatus('error');
        setConnectionError('All WebSocket URLs failed');
        return;
      }

      const wsUrl = wsUrls[urlIndex];
      console.log(`🔌 Attempting WebSocket connection to: ${wsUrl}`);
      setConnectionError(`Trying ${wsUrl}...`);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // Set connection timeout
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          console.log(`⏰ Connection timeout for ${wsUrl}`);
          ws.close();
          // Try next URL
          connectWebSocket(urlIndex + 1);
        }
      }, 5000);

      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        setConnectionStatus('connected');
        setConnectionError('');
        reconnectAttemptRef.current = 0; // Reset reconnection counter
        console.log(`✅ Connected to trading server at ${wsUrl}`);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📩 Received:', data);

          if (data.type === 'initial') {
            setPositions(data.data.positions || []);
            setOpeningOrders(data.data.openingOrders || []);
            setClosingOrders(data.data.closingOrders || []);
            setCompletedTrades(data.data.completedTrades || []);
            setMetrics(data.data.metrics || {});
            console.log("📊 Initial data loaded");
          } else if (data.type === 'positionUpdate') {
            setPositions(data.data.positions || []);
            console.log("📍 Position update received");
          } else if (data.type === 'orderUpdate') {
            setOpeningOrders(data.data.openingOrders || []);
            setClosingOrders(data.data.closingOrders || []);
            setCompletedTrades(data.data.completedTrades || []);
            setMetrics(data.data.metrics || {});
            console.log("📋 Order update received");
          }

          setLastUpdate(new Date());
        } catch (error) {
          console.error("❌ Error parsing WebSocket message:", error);
          setConnectionError(`Parse error: ${error.message}`);
        }
      };

      ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        console.log(`❌ WebSocket closed: ${event.code} ${event.reason} (${wsUrl})`);

        if (event.code === 1006 || event.code === 1000) {
          // Try next URL if available, otherwise reconnect to first
          if (urlIndex < wsUrls.length - 1) {
            console.log('🔄 Trying next WebSocket URL...');
            connectWebSocket(urlIndex + 1);
          } else {
            setConnectionStatus('disconnected');
            setConnectionError(`Connection closed: ${event.code} ${event.reason || ''}`);

            // Reconnect after 3 seconds to first URL
            if (reconnectAttemptRef.current < maxReconnectAttempts) {
              reconnectTimeoutRef.current = setTimeout(() => {
                console.log('🔄 Attempting to reconnect...');
                setConnectionStatus('connecting');
                reconnectAttemptRef.current++;
                connectWebSocket(0);
              }, 3000);
            }
          }
        }
      };

      ws.onerror = (error) => {
        clearTimeout(connectionTimeout);
        console.error(`❌ WebSocket error (${wsUrl}):`, error);

        // Try next URL
        if (urlIndex < wsUrls.length - 1) {
          console.log('🔄 Trying next WebSocket URL due to error...');
          connectWebSocket(urlIndex + 1);
        } else {
          setConnectionStatus('error');
          setConnectionError('All WebSocket connections failed');
        }
      };

    } catch (error) {
      console.error('❌ Failed to create WebSocket connection:', error);
      setConnectionStatus('error');
      setConnectionError(`Connection failed: ${error.message}`);
    }
  };

  // Manual reconnect function
  const manualReconnect = () => {
    reconnectAttemptRef.current = 0;
    setConnectionStatus('connecting');
    setConnectionError('');
    connectWebSocket(0);
  };

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-green-600 bg-green-100';
      case 'connecting': return 'text-yellow-600 bg-yellow-100';
      case 'disconnected': return 'text-red-600 bg-red-100';
      case 'error': return 'text-red-700 bg-red-200';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getSideColor = (side) => {
    return side?.toLowerCase() === 'buy' ? 'text-green-600 bg-green-100' : 'text-red-600 bg-red-100';
  };

  const formatNumber = (num, decimals = 2) => {
    return parseFloat(num || 0).toFixed(decimals);
  };

  const formatCurrency = (num) => {
    const value = parseFloat(num || 0);
    return `$${value.toFixed(2)}`;
  };

  const formatVolume = (num) => {
    const value = parseFloat(num || 0);
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toFixed(0);
  };

  return (
    <div className="w-screen min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-3">
            <div className={`px-4 py-2 rounded-full text-sm font-medium ${getStatusColor()}`}>
              {connectionStatus === 'connected' ? '🟢' :
                connectionStatus === 'connecting' ? '🟡' :
                  connectionStatus === 'disconnected' ? '🔴' : '⚠️'}
              {connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
            </div>
            {serverStatus && (
              <div className={`px-4 py-2 rounded-full text-sm font-medium ${serverStatus === 'connected' ? 'text-green-600 bg-green-100' : 'text-red-600 bg-red-100'
                }`}>
                🖥️ Server: {serverStatus}
              </div>
            )}
            {connectionError && (
              <div className="px-4 py-2 rounded-full text-sm font-medium text-red-700 bg-red-100">
                ❌ {connectionError}
              </div>
            )}
            {(connectionStatus === 'error' || connectionStatus === 'disconnected') && (
              <button
                onClick={manualReconnect}
                className="px-4 py-2 rounded-full text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors"
              >
                🔄 Reconnect
              </button>
            )}
            {lastUpdate && (
              <div className="px-4 py-2 rounded-full text-sm font-medium text-blue-700 bg-blue-100">
                📅 Updated: {lastUpdate.toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>

        {/* Debug Information */}
        {/* {connectionStatus !== 'connected' && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="font-medium text-yellow-800 mb-2">🔧 Connection Troubleshooting</h3>
            <div className="text-sm text-yellow-700 space-y-1">
              <p>• Make sure the server is running on port 3001</p>
              <p>• Check if you're using HTTPS (frontend) with WS (backend) - this causes mixed content issues</p>
              <p>• Verify firewall settings allow connections to port 3001</p>
              <p>• Current page URL: {window.location.href}</p>
              <p>• Reconnect attempts: {reconnectAttemptRef.current}/{maxReconnectAttempts}</p>
            </div>
          </div>
        )} */}

        {/* Rest of your component remains the same... */}
        {/* Metrics Section */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-gray-600">Total Trades</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{metrics.totalTrades || 0}</p>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <span className="text-sm text-gray-600">Wins</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{metrics.winCount || 0}</p>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-4 h-4 text-red-600" />
              <span className="text-sm text-gray-600">Losses</span>
            </div>
            <p className="text-2xl font-bold text-red-600">{metrics.lossCount || 0}</p>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-purple-600" />
              <span className="text-sm text-gray-600">Win Rate</span>
            </div>
            <p className="text-2xl font-bold text-purple-600">{formatNumber(metrics.winRate || 0, 1)}%</p>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-gray-600">Total PnL</span>
            </div>
            <p className={`text-2xl font-bold ${(metrics.totalPnL || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(metrics.totalPnL || 0)}
            </p>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-indigo-600" />
              <span className="text-sm text-gray-600">Avg Win</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(metrics.avgWin || 0)}</p>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-2 gap-8">

          {/* Live Positions */}
          <div className="bg-white rounded-xl shadow-sm border">
            <LivePositionsREST />
          </div>

          {/* Opening Orders (closedPnL = 0) */}
          <div className="bg-white rounded-xl shadow-sm border">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <ArrowUp className="w-5 h-5 text-green-600" />
                <h2 className="text-xl font-semibold text-gray-900">Position Opening Orders</h2>
                <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                  {openingOrders.length}
                </span>
              </div>
            </div>
            <div className="p-6 max-h-96 overflow-y-auto">
              {openingOrders.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No opening orders
                </div>
              ) : (
                <div className="space-y-4">
                  {openingOrders.slice().reverse().map((order, index) => (
                    <div key={index} className="border border-green-200 rounded-lg p-4 bg-green-50">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900">{order.symbol}</span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getSideColor(order.side)}`}>
                            {order.side?.toUpperCase()}
                          </span>
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                            {order.orderStatus}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">
                            {order.processedAt ? new Date(order.processedAt).toLocaleTimeString() :
                              order.updatedTime ? new Date(parseInt(order.updatedTime)).toLocaleTimeString() : '-'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Quantity</p>
                          <p className="font-semibold">{formatNumber(order.cumExecQty )}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Price</p>
                          <p className="font-semibold">{formatCurrency(order.avgPrice || order.price)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Fees</p>
                          <p className="font-semibold text-red-600">{formatCurrency(order.cumExecFee || 0)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Closing Orders and Completed Trades */}
        <div className="mt-8 grid lg:grid-cols-2 gap-8">

          {/* Closing Orders (closedPnL != 0) */}
          <div className="bg-white rounded-xl shadow-sm border">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <ArrowDown className="w-5 h-5 text-red-600" />
                <h2 className="text-xl font-semibold text-gray-900">Position Closing Orders</h2>
                <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                  {closingOrders.length}
                </span>
              </div>
            </div>
            <div className="p-6 max-h-96 overflow-y-auto">
              {closingOrders.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No closing orders
                </div>
              ) : (
                <div className="space-y-4">
                  {closingOrders.slice().reverse().map((order, index) => (
                    <div key={index} className="border border-red-200 rounded-lg p-4 bg-red-50">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900">{order.symbol}</span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getSideColor(order.side)}`}>
                            {order.side?.toUpperCase()}
                          </span>
                          <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                            {order.orderStatus}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">
                            {order.processedAt ? new Date(order.processedAt).toLocaleTimeString() :
                              order.updatedTime ? new Date(parseInt(order.updatedTime)).toLocaleTimeString() : '-'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm mb-2">
                        <div>
                          <p className="text-gray-600">Quantity</p>
                          <p className="font-semibold">{formatNumber(order.cumExecQty || order.qty)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Price</p>
                          <p className="font-semibold">{formatCurrency(order.avgPrice || order.price)}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Closed PnL</p>
                          <p className={`font-bold ${parseFloat(order.closedPnL || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(order.closedPnL || 0)}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">Fees</p>
                          <p className="font-semibold text-red-600">{formatCurrency(order.cumExecFee || 0)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Performance Summary */}
          <div className="bg-white rounded-xl shadow-sm border">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-purple-600" />
                <h2 className="text-xl font-semibold text-gray-900">Performance Summary</h2>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-6">
                {/* Winning Trades */}
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                    <h3 className="font-semibold text-green-800">Winning Trades</h3>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-green-700 text-sm">Count:</span>
                      <span className="font-bold text-green-800">{metrics.winCount || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-700 text-sm">Total:</span>
                      <span className="font-bold text-green-800">{formatCurrency(metrics.winPnL || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-700 text-sm">Average:</span>
                      <span className="font-bold text-green-800">{formatCurrency(metrics.avgWin || 0)}</span>
                    </div>
                  </div>
                </div>

                {/* Losing Trades */}
                <div className="bg-red-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingDown className="w-5 h-5 text-red-600" />
                    <h3 className="font-semibold text-red-800">Losing Trades</h3>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-red-700 text-sm">Count:</span>
                      <span className="font-bold text-red-800">{metrics.lossCount || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-700 text-sm">Total:</span>
                      <span className="font-bold text-red-800">{formatCurrency(-(metrics.lossPnL || 0))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-700 text-sm">Average:</span>
                      <span className="font-bold text-red-800">{formatCurrency(-(metrics.avgLoss || 0))}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Completed Trades Table */}
        <div className="mt-8 bg-white rounded-xl shadow-sm border">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-600" />
              <h2 className="text-xl font-semibold text-gray-900">Completed Trades</h2>
              <span className="bg-purple-100 text-purple-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                {completedTrades.length}
              </span>
            </div>
          </div>
          <div className="p-6">
            {completedTrades.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No completed trades yet
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200">
                    <tr className="text-left text-sm text-gray-600">
                      <th className="pb-3 font-medium">Symbol</th>
                      <th className="pb-3 font-medium">Side</th>
                      <th className="pb-3 font-medium">Quantity</th>
                      <th className="pb-3 font-medium">Exit Price</th>
                      <th className="pb-3 font-medium">Gross PnL</th>
                      <th className="pb-3 font-medium">Fees</th>
                      <th className="pb-3 font-medium">Net PnL</th>
                      <th className="pb-3 font-medium">Time</th>
                      <th className="pb-3 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {completedTrades.slice().reverse().map((trade, index) => (
                      <tr key={index} className="text-sm hover:bg-gray-50">
                        <td className="py-3 font-medium text-gray-900">{trade.symbol}</td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getSideColor(trade.side)}`}>
                            {trade.side?.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 font-medium">{formatNumber(trade.quantity)}</td>
                        <td className="py-3">{formatCurrency(trade.exitPrice)}</td>
                        <td className={`py-3 font-medium ${trade.grossPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(trade.grossPnL)}
                        </td>
                        <td className="py-3 text-red-600">{formatCurrency(trade.fees)}</td>
                        <td className={`py-3 font-bold ${trade.isWin ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(trade.netPnL)}
                        </td>
                        <td className="py-3 text-gray-600">
                          {new Date(trade.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${trade.isWin ? 'text-green-600 bg-green-100' : 'text-red-600 bg-red-100'}`}>
                            {trade.isWin ? 'WIN' : 'LOSS'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Connection Debug Info */}
        <div className="mt-8 bg-gray-100 rounded-xl p-4">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center gap-4">
              <span>🔌 WebSocket: {connectionStatus}</span>
              <span>📊 Opening Orders: {openingOrders.length}</span>
              <span>📈 Closing Orders: {closingOrders.length}</span>
              <span>✅ Completed: {completedTrades.length}</span>
            </div>
            {lastUpdate && (
              <span>Last Update: {lastUpdate.toLocaleTimeString()}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradingDashboard;