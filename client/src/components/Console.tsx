
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Maximize2, Minimize2, Copy, RotateCcw, GripVertical, Archive, Clock, Download, Trash2, Pause, Play, Server, Monitor } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ConsoleLog {
  id: number;
  level: string;
  message: string;
  source: string;
  metadata?: any;
  timestamp: string;
}

interface ConsoleProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SavedLogCollection {
  id: string;
  name: string;
  logs: ConsoleLog[];
  savedAt: string;
  totalEntries: number;
}

export default function Console({ isOpen, onClose }: ConsoleProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [serverLogs, setServerLogs] = useState<ConsoleLog[]>([]);
  const [browserLogs, setBrowserLogs] = useState<ConsoleLog[]>([]);
  const [logViewMode, setLogViewMode] = useState<'server' | 'browser'>('server');
  const [isConnected, setIsConnected] = useState(false);
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [size, setSize] = useState({ width: 700, height: 500 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  // Enhanced clipboard and persistent storage states
  const [selectedLogIds, setSelectedLogIds] = useState<Set<number>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [savedLogCollections, setSavedLogCollections] = useState<SavedLogCollection[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showSavedLogsDialog, setShowSavedLogsDialog] = useState(false);
  const [saveLogName, setSaveLogName] = useState('');
  const [rangeStart, setRangeStart] = useState<number | null>(null);
  const [rangeEnd, setRangeEnd] = useState<number | null>(null);
  const [showRangeDialog, setShowRangeDialog] = useState(false);
  
  // Pause/Resume functionality
  const [isPaused, setIsPaused] = useState(false);
  
  // Derived state for current logs based on view mode
  const currentLogs = logViewMode === 'server' ? serverLogs : browserLogs;
  
  // Helper function to serialize console arguments
  const serializeConsoleArgs = (args: any[]): string => {
    return args.map(arg => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) {
        return `${arg.name}: ${arg.message}\n${arg.stack}`;
      }
      if (arg && typeof arg === 'object') {
        try {
          // Handle DOM elements
          if (arg.nodeType) {
            return `<${arg.tagName?.toLowerCase() || 'unknown'}${arg.id ? ` id="${arg.id}"` : ''}${arg.className ? ` class="${arg.className}"` : ''}>`;
          }
          // Handle circular references and depth limit
          return JSON.stringify(arg, (key, value) => {
            if (typeof value === 'object' && value !== null) {
              if (value.nodeType) return `[DOM Element: ${value.tagName}]`;
              if (typeof value === 'function') return '[Function]';
            }
            return value;
          }, 2);
        } catch (e) {
          return '[Circular/Complex Object]';
        }
      }
      return String(arg);
    }).join(' ');
  };
  
  // Create browser console log entry
  const createBrowserLogEntry = (level: string, args: any[]): ConsoleLog => {
    browserLogIdRef.current += 1;
    const stack = new Error().stack;
    const callerLine = stack?.split('\n')[3] || 'unknown';
    
    return {
      id: browserLogIdRef.current,
      level: level.toLowerCase(),
      message: serializeConsoleArgs(args),
      source: 'browser',
      metadata: {
        originalArgs: args,
        caller: callerLine,
        rawLevel: level
      },
      timestamp: new Date().toISOString()
    };
  };
  
  // Setup browser console interception
  const setupBrowserConsoleCapture = () => {
    if (isConsoleInterceptedRef.current || typeof window === 'undefined') return;
    
    // Store original console methods
    originalConsoleRef.current = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug
    };
    
    // Patch console methods
    const patchMethod = (method: keyof typeof console, level: string) => {
      const original = originalConsoleRef.current![method as keyof typeof originalConsoleRef.current];
      (console as any)[method] = (...args: any[]) => {
        // Call original method to preserve native console behavior
        original.apply(console, args);
        
        // Capture log if not paused and in browser mode
        if (!isPaused && logViewMode === 'browser') {
          const logEntry = createBrowserLogEntry(level, args);
          setBrowserLogs(prev => [logEntry, ...prev].slice(0, 1000)); // Keep last 1000
        }
      };
    };
    
    patchMethod('log', 'info');
    patchMethod('info', 'info');
    patchMethod('warn', 'warn');
    patchMethod('error', 'error');
    patchMethod('debug', 'debug');
    
    isConsoleInterceptedRef.current = true;
  };
  
  // Restore original console methods
  const restoreOriginalConsole = () => {
    if (!isConsoleInterceptedRef.current || !originalConsoleRef.current) return;
    
    console.log = originalConsoleRef.current.log;
    console.info = originalConsoleRef.current.info;
    console.warn = originalConsoleRef.current.warn;
    console.error = originalConsoleRef.current.error;
    console.debug = originalConsoleRef.current.debug;
    
    isConsoleInterceptedRef.current = false;
    originalConsoleRef.current = null;
  };
  
  const { toast } = useToast();
  
  const consoleRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Browser console capture refs
  const originalConsoleRef = useRef<{
    log: typeof console.log;
    info: typeof console.info;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
  } | null>(null);
  const browserLogIdRef = useRef(0);
  const isConsoleInterceptedRef = useRef(false);

  // Load saved log collections from database and localStorage on mount
  useEffect(() => {
    const loadSavedCollections = async () => {
      try {
        // Try to load from database first
        const response = await fetch('/api/console-logs/collections');
        if (response.ok) {
          const data = await response.json();
          if (data.collections && data.collections.length > 0) {
            setSavedLogCollections(data.collections);
            return;
          }
        }
      } catch (error) {
        console.error('Failed to load collections from database:', error);
      }

      // Fallback to localStorage
      const savedCollections = localStorage.getItem('console-saved-logs');
      if (savedCollections) {
        try {
          setSavedLogCollections(JSON.parse(savedCollections));
        } catch (error) {
          console.error('Failed to load saved log collections from localStorage:', error);
        }
      }
    };

    loadSavedCollections();
  }, []);

  // Save log collections to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('console-saved-logs', JSON.stringify(savedLogCollections));
  }, [savedLogCollections]);
  
  // Handle console interception based on log view mode
  useEffect(() => {
    if (logViewMode === 'browser') {
      setupBrowserConsoleCapture();
    } else {
      restoreOriginalConsole();
    }
    
    // Cleanup on unmount or mode change
    return () => {
      if (logViewMode === 'browser') {
        restoreOriginalConsole();
      }
    };
  }, [logViewMode]);
  
  // Cleanup console interception on component unmount
  useEffect(() => {
    return () => {
      restoreOriginalConsole();
    };
  }, []);

  // Fetch ALL logs from API (no limit, from deployment start)
  const fetchLogs = async (offset = 0) => {
    try {
      // Fetch in batches of 1000 to get ALL logs
      const response = await fetch(`/api/console-logs?limit=1000&offset=${offset}`);
      if (response.ok) {
        const data = await response.json();
        if (data.length > 0) {
          setServerLogs(prev => {
            const combined = offset === 0 ? data : [...prev, ...data];
            // Remove duplicates by ID
            const unique = combined.filter((log: ConsoleLog, index: number, self: ConsoleLog[]) => 
              index === self.findIndex((l: ConsoleLog) => l.id === log.id)
            );
            return unique.sort((a: ConsoleLog, b: ConsoleLog) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          });
          
          // If we got 1000 logs, there might be more - fetch next batch
          if (data.length === 1000) {
            setTimeout(() => fetchLogs(offset + 1000), 100);
          }
        }
        if (offset === 0) scrollToBottom();
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  };

  // Setup WebSocket connection for real-time logs
  const setupWebSocket = () => {
    if (isPaused) return; // Don't setup WebSocket if paused
    
    // Close existing WebSocket first to avoid multiple connections
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/console`;
    
    try {
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        setIsConnected(true);
        console.log('Console WebSocket connected');
      };
      
      ws.onmessage = (event) => {
        if (isPaused) return; // Don't process messages if paused
        try {
          const logEntry = JSON.parse(event.data);
          setServerLogs(prev => [logEntry, ...prev].slice(0, 1000)); // Keep last 1000 logs
          scrollToBottom();
        } catch (error) {
          console.error('Failed to parse log entry:', error);
        }
      };
      
      ws.onclose = () => {
        setIsConnected(false);
        console.log('Console WebSocket disconnected');
        // Only reconnect if not paused and component is still mounted
        if (!isPaused && wsRef.current === ws) {
          setTimeout(() => {
            if (!isPaused && wsRef.current === ws) {
              setupWebSocket();
            }
          }, 3000);
        }
      };
      
      ws.onerror = (error) => {
        console.error('Console WebSocket error:', error);
        setIsConnected(false);
      };
      
      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      setIsConnected(false);
    }
  };

  // Setup auto-refresh every 15 seconds
  const setupAutoRefresh = () => {
    if (isPaused) return; // Don't setup auto-refresh if paused
    
    refreshIntervalRef.current = setInterval(() => {
      if (!isPaused) { // Only fetch logs if not paused
        fetchLogs();
      }
    }, 15000);
  };

  // Scroll to bottom of logs
  const scrollToBottom = () => {
    setTimeout(() => {
      if (logsContainerRef.current) {
        logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
      }
    }, 100);
  };

  // Copy functions
  const copyAllLogs = async () => {
    try {
      const logText = currentLogs.map(log => 
        `[${formatTimestamp(log.timestamp)}] ${log.level.toUpperCase()}: ${log.message}`
      ).join('\n');
      
      await navigator.clipboard.writeText(logText);
      toast({
        title: 'All Logs Copied',
        description: `${currentLogs.length} log entries copied to clipboard`,
      });
    } catch (error) {
      toast({
        title: 'Copy Failed',
        description: 'Failed to copy logs to clipboard',
        variant: 'destructive',
      });
    }
  };

  const copySelectedLogs = async () => {
    try {
      const selectedLogs = currentLogs.filter(log => selectedLogIds.has(log.id));
      const logText = selectedLogs.map(log => 
        `[${formatTimestamp(log.timestamp)}] ${log.level.toUpperCase()}: ${log.message}`
      ).join('\n');
      
      await navigator.clipboard.writeText(logText);
      toast({
        title: 'Selected Logs Copied',
        description: `${selectedLogs.length} selected log entries copied to clipboard`,
      });
      setSelectedLogIds(new Set());
      setIsSelectionMode(false);
    } catch (error) {
      toast({
        title: 'Copy Failed',
        description: 'Failed to copy selected logs to clipboard',
        variant: 'destructive',
      });
    }
  };

  const copyRangeLogs = async () => {
    if (rangeStart === null || rangeEnd === null) {
      toast({
        title: 'Invalid Range',
        description: 'Please specify both start and end entry numbers',
        variant: 'destructive',
      });
      return;
    }

    try {
      const sortedLogs = [...currentLogs].reverse(); // Show oldest first for range selection
      const start = Math.max(0, rangeStart - 1);
      const end = Math.min(sortedLogs.length, rangeEnd);
      const rangeLogs = sortedLogs.slice(start, end);
      
      const logText = rangeLogs.map(log => 
        `[${formatTimestamp(log.timestamp)}] ${log.level.toUpperCase()}: ${log.message}`
      ).join('\n');
      
      await navigator.clipboard.writeText(logText);
      toast({
        title: 'Range Copied',
        description: `Log entries ${rangeStart}-${rangeEnd} (${rangeLogs.length} entries) copied to clipboard`,
      });
      setShowRangeDialog(false);
      setRangeStart(null);
      setRangeEnd(null);
    } catch (error) {
      toast({
        title: 'Copy Failed',
        description: 'Failed to copy log range to clipboard',
        variant: 'destructive',
      });
    }
  };

  const copySpecificLog = async (log: ConsoleLog) => {
    try {
      const logText = `[${formatTimestamp(log.timestamp)}] ${log.level.toUpperCase()}: ${log.message}`;
      await navigator.clipboard.writeText(logText);
      toast({
        title: 'Log Entry Copied',
        description: 'Single log entry copied to clipboard',
      });
    } catch (error) {
      toast({
        title: 'Copy Failed',
        description: 'Failed to copy log entry to clipboard',
        variant: 'destructive',
      });
    }
  };

  // Save current logs persistently to database
  const saveCurrentLogs = async () => {
    if (!saveLogName.trim()) {
      toast({
        title: 'Name Required',
        description: 'Please enter a name for the log collection',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Save to database via API for true persistence
      const response = await fetch('/api/console-logs/save-collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: saveLogName.trim(),
          logs: currentLogs,
          totalEntries: currentLogs.length
        })
      });

      if (response.ok) {
        const savedCollection = await response.json();
        
        // Also save to localStorage as backup
        const newCollection: SavedLogCollection = {
          id: savedCollection.id || Date.now().toString(),
          name: saveLogName.trim(),
          logs: [...currentLogs],
          savedAt: new Date().toISOString(),
          totalEntries: currentLogs.length
        };

        setSavedLogCollections(prev => [newCollection, ...prev].slice(0, 50));
        setSaveLogName('');
        setShowSaveDialog(false);
        
        toast({
          title: 'Logs Saved Permanently',
          description: `Log collection "${newCollection.name}" saved to database with ${currentLogs.length} entries`,
        });
      } else {
        throw new Error('Failed to save to database');
      }
    } catch (error) {
      // Fallback to localStorage only
      const newCollection: SavedLogCollection = {
        id: Date.now().toString(),
        name: saveLogName.trim(),
        logs: [...currentLogs],
        savedAt: new Date().toISOString(),
        totalEntries: currentLogs.length
      };

      setSavedLogCollections(prev => [newCollection, ...prev].slice(0, 50));
      setSaveLogName('');
      setShowSaveDialog(false);
      
      toast({
        title: 'Logs Saved (Local)',
        description: `Log collection "${newCollection.name}" saved locally with ${currentLogs.length} entries`,
        variant: 'destructive',
      });
    }
  };

  // Load saved log collection from database or localStorage
  const loadSavedLogs = async (collection: SavedLogCollection) => {
    // Auto-pause when loading a collection to prevent immediate overwrite
    setIsPaused(true);
    
    // Stop WebSocket and auto-refresh immediately
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
    setIsConnected(false);
    
    try {
      // Try to load from database first
      const response = await fetch(`/api/console-logs/collections/${collection.id}`);
      if (response.ok) {
        const data = await response.json();
        if (data.collection && data.collection.logs) {
          const loadedLogs = data.collection.logs;
        if (logViewMode === 'server') {
          setServerLogs(loadedLogs);
        } else {
          setBrowserLogs(loadedLogs);
        }
          toast({
            title: 'Logs Loaded (Paused)',
            description: `Loaded "${collection.name}" with ${data.collection.logs.length} entries. Click Resume to continue live logs.`,
          });
          setShowSavedLogsDialog(false);
          return;
        }
      }
    } catch (error) {
      console.error('Failed to load from database, using local copy:', error);
    }

    // Fallback to localStorage copy
    if (logViewMode === 'server') {
      setServerLogs(collection.logs || []);
    } else {
      setBrowserLogs(collection.logs || []);
    }
    toast({
      title: 'Logs Loaded (Paused)',
      description: `Loaded "${collection.name}" with ${collection.totalEntries} entries. Click Resume to continue live logs.`,
    });
    setShowSavedLogsDialog(false);
  };

  // Delete saved log collection
  const deleteSavedLogs = (collectionId: string) => {
    setSavedLogCollections(prev => prev.filter(c => c.id !== collectionId));
    toast({
      title: 'Collection Deleted',
      description: 'Log collection has been deleted',
    });
  };

  // Export saved logs as formatted HTML (console-like appearance)
  const exportSavedLogs = (collection: SavedLogCollection) => {
    try {
      // Validate collection and logs data
      if (!collection) {
        throw new Error('Collection data is missing');
      }
      
      // Handle different possible log data structures
      let logsToExport: ConsoleLog[] = [];
      
      // Strategy 1: Check if we have current logs loaded and this collection is being viewed
      if (currentLogs && currentLogs.length > 0) {
        console.log('Using current logs from memory:', currentLogs.length);
        logsToExport = currentLogs;
      }
      // Strategy 2: Try the collection's logs property
      else if (collection.logs && Array.isArray(collection.logs) && collection.logs.length > 0) {
        console.log('Using collection.logs:', collection.logs.length);
        logsToExport = collection.logs;
      } 
      // Strategy 3: Handle case where logs are stored as JSON string in logsData
      else if ((collection as any).logsData) {
        try {
          console.log('Attempting to parse logsData...');
          const parsedLogs = typeof (collection as any).logsData === 'string' 
            ? JSON.parse((collection as any).logsData) 
            : (collection as any).logsData;
          if (Array.isArray(parsedLogs) && parsedLogs.length > 0) {
            console.log('Using parsed logsData:', parsedLogs.length);
            logsToExport = parsedLogs;
          }
        } catch (parseError) {
          console.error('Failed to parse logsData:', parseError);
        }
      }
      
      // Strategy 4: Try to fetch from database if we have an ID
      if ((!logsToExport || logsToExport.length === 0) && collection.id) {
        console.log('Attempting to fetch from database...');
        // This is a fallback - we'll create a simple export with available data
        logsToExport = [{
          id: 1,
          level: 'INFO',
          message: `Collection "${collection.name}" contains ${collection.totalEntries} entries but logs are not available for export. This may be because the collection was saved to database and needs to be loaded first.`,
          source: 'Export',
          timestamp: new Date().toISOString()
        }];
      }
      
      if (!Array.isArray(logsToExport) || logsToExport.length === 0) {
        throw new Error('Collection has no valid logs to export');
      }
      
      // Escape HTML to prevent issues
      const escapeHtml = (unsafe: string) => {
        if (typeof unsafe !== 'string') {
          return String(unsafe || '');
        }
        return unsafe
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      };
      
      const getLevelBadgeStyle = (level: string) => {
        switch ((level || 'INFO').toUpperCase()) {
          case 'ERROR':
            return 'background: #ef4444; color: white;';
          case 'WARN':
            return 'background: #f59e0b; color: white;';
          case 'INFO':
            return 'background: #3b82f6; color: white;';
          case 'DEBUG':
            return 'background: #6b7280; color: white;';
          default:
            return 'background: #6b7280; color: white;';
        }
      };
      
      const formatLogEntry = (log: ConsoleLog, index: number) => {
        // Validate log entry
        if (!log) {
          return `<div class="log-entry" style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 14px; color: #ef4444;">Invalid log entry</div>`;
        }
        
        const timestamp = escapeHtml(formatTimestamp(log.timestamp || new Date().toISOString()));
        const level = escapeHtml((log.level || 'INFO').toUpperCase());
        const message = escapeHtml(log.message || 'No message');
        const source = log.source ? escapeHtml(log.source) : '';
        const metadata = log.metadata ? escapeHtml(JSON.stringify(log.metadata, null, 2)) : '';
        const badgeStyle = getLevelBadgeStyle(log.level || 'INFO');
        
        return `<div class="log-entry" style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 14px; display: flex; align-items: flex-start; gap: 8px; ${index % 2 === 0 ? '' : 'background-color: #f9fafb;'}">
            <span class="log-timestamp" style="color: #6b7280; font-size: 12px; white-space: nowrap; margin-top: 2px;">${timestamp}</span>
            <span class="log-level-badge" style="padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: 600; text-transform: uppercase; min-width: 50px; text-align: center; ${badgeStyle}">${level}</span>
            <div class="log-content" style="flex: 1;">
              <div class="log-message" style="white-space: pre-wrap; word-break: break-word;">${message}</div>
              ${source ? `<div class="log-source" style="color: #9ca3af; font-size: 11px; margin-top: 2px;">Source: ${source}</div>` : ''}
              ${metadata ? `<details class="log-metadata" style="margin-top: 4px; font-size: 12px;"><summary style="color: #6b7280; cursor: pointer;">Metadata</summary><pre style="background: #f9fafb; padding: 8px; border-radius: 4px; margin-top: 4px; overflow-x: auto; font-size: 11px;">${metadata}</pre></details>` : ''}
            </div>
          </div>`;
      };
      
      const collectionName = escapeHtml(collection.name || 'Unnamed Collection');
      const savedTimestamp = escapeHtml(formatTimestamp(collection.savedAt || new Date().toISOString()));
      const exportTimestamp = escapeHtml(new Date().toLocaleString());
      const totalEntries = collection.totalEntries || logsToExport.length || 0;
      
      // Generate the HTML content with exact console styling
      const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Console Logs - ${collectionName}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #ffffff;
            line-height: 1.5;
        }
        .header {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 20px;
        }
        .header h1 {
            margin: 0 0 8px 0;
            color: #1e293b;
            font-size: 24px;
            font-weight: 600;
        }
        .header-info {
            color: #64748b;
            font-size: 14px;
        }
        .logs-container {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            overflow: hidden;
            min-height: 200px;
        }
        .log-entry:hover {
            background-color: #f1f5f9 !important;
        }
        .no-logs {
            padding: 40px;
            text-align: center;
            color: #6b7280;
            font-style: italic;
        }
        @media (max-width: 768px) {
            body { padding: 10px; }
            .log-entry { font-size: 12px; padding: 6px 8px; }
            .log-timestamp { display: none; }
        }
        @media print {
            body { background: white; }
            .header { background: white; border: 1px solid #ccc; }
            .logs-container { border: 1px solid #ccc; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Console Logs Export</h1>
        <div class="header-info">
            <strong>Collection:</strong> ${collectionName}<br>
            <strong>Total Entries:</strong> ${totalEntries}<br>
            <strong>Saved:</strong> ${savedTimestamp}<br>
            <strong>Exported:</strong> ${exportTimestamp}
        </div>
    </div>
    <div class="logs-container">
        ${logsToExport && logsToExport.length > 0 
          ? logsToExport.map((log, index) => formatLogEntry(log, index)).join('')
          : '<div class="no-logs">No log entries found in this collection</div>'
        }
    </div>
    <div style="margin-top: 20px; padding: 16px; background: #f8fafc; border-radius: 8px; text-align: center; color: #64748b; font-size: 12px;">
        Generated by Enhanced Console • ${logsToExport ? logsToExport.length : 0} log entries
    </div>
</body>
</html>`;
      
      // Create and download the file
      const dataBlob = new Blob([htmlContent], {type: 'text/html'});
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      const fileName = `console-logs-${(collection.name || 'collection').replace(/[^a-z0-9]/gi, '-')}-${new Date().toISOString().split('T')[0]}.html`;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: 'Export Complete',
        description: `Log collection exported as formatted HTML file with ${logsToExport ? logsToExport.length : 0} entries`,
      });
    } catch (error) {
      console.error('Export error:', error);
      console.error('Collection data:', {
        name: collection?.name,
        id: collection?.id,
        totalEntries: collection?.totalEntries,
        hasLogs: collection?.logs ? collection.logs.length : 'no logs property',
        hasLogsData: (collection as any)?.logsData ? 'yes' : 'no',
        currentLogsLength: currentLogs.length || 0
      });
      
      toast({
        title: 'Export Failed',
        description: `Failed to export log collection: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    }
  };

  // Handle pause/resume functionality
  const handlePauseResume = () => {
    if (isPaused) {
      // Resume: restart WebSocket and auto-refresh
      setIsPaused(false);
      // Wait a bit for state to update, then setup connections
      setTimeout(() => {
        setupWebSocket();
        setupAutoRefresh();
        fetchLogs(); // Get latest logs
      }, 100);
      toast({
        title: 'Console Resumed',
        description: 'Live log streaming resumed',
      });
    } else {
      // Pause: stop WebSocket and auto-refresh immediately
      setIsPaused(true);
      
      // Cleanup WebSocket
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
        wsRef.current = null;
      }
      
      // Cleanup auto-refresh interval
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
      
      setIsConnected(false);
      toast({
        title: 'Console Paused',
        description: 'Live log streaming paused',
      });
    }
  };

  // Handle last log button (manual refresh)
  const handleLastLog = () => {
    if (!isPaused && logViewMode === 'server') {
      fetchLogs();
      toast({
        title: 'Logs Refreshed',
        description: 'Console logs have been refreshed',
      });
    } else if (logViewMode === 'browser') {
      toast({
        title: 'Refresh Unavailable',
        description: 'Browser logs cannot be manually refreshed',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Console Paused',
        description: 'Resume console to refresh logs',
        variant: 'destructive',
      });
    }
  };

  // Handle maximize/minimize
  const toggleMaximize = () => {
    setIsMaximized(!isMaximized);
  };

  // Log selection handling
  const toggleLogSelection = (logId: number) => {
    const newSelection = new Set(selectedLogIds);
    if (newSelection.has(logId)) {
      newSelection.delete(logId);
    } else {
      newSelection.add(logId);
    }
    setSelectedLogIds(newSelection);
  };

  const selectAllLogs = () => {
    setSelectedLogIds(new Set(currentLogs.map(log => log.id)));
  };

  const clearSelection = () => {
    setSelectedLogIds(new Set());
    setIsSelectionMode(false);
  };

  // Mouse event handlers for dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isMaximized) return;
    
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  // Touch event handlers for dragging
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isMaximized) return;
    
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({
      x: touch.clientX - position.x,
      y: touch.clientY - position.y,
    });
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (isDragging && !isMaximized) {
      e.preventDefault(); // Prevent scrolling
      const touch = e.touches[0];
      setPosition({
        x: touch.clientX - dragStart.x,
        y: touch.clientY - dragStart.y,
      });
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setIsResizing(false);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging && !isMaximized) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
  };

  // Mouse event handlers for resizing
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    if (isMaximized) return;
    e.stopPropagation();
    
    setIsResizing(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
    });
  };

  // Touch event handlers for resizing
  const handleResizeTouchStart = (e: React.TouchEvent) => {
    if (isMaximized) return;
    e.stopPropagation();
    
    const touch = e.touches[0];
    setIsResizing(true);
    setDragStart({
      x: touch.clientX,
      y: touch.clientY,
    });
  };

  const handleResizeTouchMove = (e: TouchEvent) => {
    if (isResizing && !isMaximized) {
      e.preventDefault();
      const touch = e.touches[0];
      const deltaX = touch.clientX - dragStart.x;
      const deltaY = touch.clientY - dragStart.y;
      
      setSize(prev => ({
        width: Math.max(400, prev.width + deltaX),
        height: Math.max(300, prev.height + deltaY),
      }));
      
      setDragStart({
        x: touch.clientX,
        y: touch.clientY,
      });
    }
  };

  const handleResizeMouseMove = (e: MouseEvent) => {
    if (isResizing && !isMaximized) {
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      
      setSize(prev => ({
        width: Math.max(400, prev.width + deltaX),
        height: Math.max(300, prev.height + deltaY),
      }));
      
      setDragStart({
        x: e.clientX,
        y: e.clientY,
      });
    }
  };

  // Effect to setup WebSocket and intervals
  useEffect(() => {
    if (isOpen && !isPaused && logViewMode === 'server') {
      fetchLogs();
      setupWebSocket();
      setupAutoRefresh();
    } else if (logViewMode === 'browser') {
      // Cleanup server connections when switching to browser mode
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
      setIsConnected(false);
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [isOpen, isPaused, logViewMode]);

  // Effect to handle mouse and touch events
  useEffect(() => {
    if (isDragging || isResizing) {
      // Mouse events
      document.addEventListener('mousemove', isDragging ? handleMouseMove : handleResizeMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      // Touch events
      document.addEventListener('touchmove', isDragging ? handleTouchMove : handleResizeTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
      
      return () => {
        document.removeEventListener('mousemove', isDragging ? handleMouseMove : handleResizeMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', isDragging ? handleTouchMove : handleResizeTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isDragging, isResizing, dragStart]);

  // Format timestamp for better readability
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  // Format log level with colors
  const getLogLevelColor = (level: string) => {
    switch (level.toUpperCase()) {
      case 'ERROR': return 'text-red-500 bg-red-50 dark:bg-red-950';
      case 'WARN': return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950';
      case 'INFO': return 'text-blue-600 bg-blue-50 dark:bg-blue-950';
      case 'DEBUG': return 'text-gray-600 bg-gray-50 dark:bg-gray-950';
      default: return 'text-gray-700 bg-gray-50 dark:bg-gray-950 dark:text-gray-300';
    }
  };

  const getLogLevelBadgeColor = (level: string) => {
    switch (level.toUpperCase()) {
      case 'ERROR': return 'bg-red-500 text-white';
      case 'WARN': return 'bg-yellow-500 text-white';
      case 'INFO': return 'bg-blue-500 text-white';
      case 'DEBUG': return 'bg-gray-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  if (!isOpen) return null;

  const consoleStyle = isMaximized
    ? {
        position: 'fixed' as const,
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 1000,
      }
    : {
        position: 'fixed' as const,
        top: `${position.y}px`,
        left: `${position.x}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        zIndex: 1000,
      };

  return (
    <>
      <div
        ref={consoleRef}
        style={consoleStyle}
        className="bg-background border shadow-lg rounded-lg overflow-hidden flex flex-col"
        data-testid="console-window"
      >
        {/* Enhanced Header Bar */}
        <CardHeader 
          className="py-2 px-4 bg-muted cursor-move select-none flex flex-row items-center justify-between space-y-0 flex-shrink-0"
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          data-testid="console-header"
        >
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm font-medium">Enhanced Console</span>
            </div>
            
            {/* Server/Browser Toggle */}
            <div className="flex items-center bg-muted rounded-md p-1 space-x-0">
              <Button
                size="sm"
                variant={logViewMode === 'server' ? 'secondary' : 'ghost'}
                className="h-6 px-2 text-xs"
                onClick={() => setLogViewMode('server')}
                data-testid="button-log-source-server"
                title="Show server logs"
              >
                <Server className="h-3 w-3 mr-1" />
                Server
              </Button>
              <Button
                size="sm"
                variant={logViewMode === 'browser' ? 'secondary' : 'ghost'}
                className="h-6 px-2 text-xs"
                onClick={() => setLogViewMode('browser')}
                data-testid="button-log-source-browser"
                title="Show browser console logs"
              >
                <Monitor className="h-3 w-3 mr-1" />
                Browser
              </Button>
            </div>
            
            <Badge variant="outline" className="text-xs">
              {logViewMode === 'server' ? 'Server Logs' : 'Browser Logs'}
            </Badge>
            
            <span className="text-xs text-muted-foreground">
              {currentLogs.length} logs • {isPaused ? 'Paused' : (logViewMode === 'server' ? (isConnected ? 'Live' : 'Disconnected') : 'Capturing')}
            </span>
            {isSelectionMode && (
              <Badge variant="secondary" className="text-xs">
                {selectedLogIds.size} selected
              </Badge>
            )}
          </div>
          
          <div className="flex items-center space-x-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={handlePauseResume}
              className="h-6 w-6 p-0"
              data-testid="button-pause-resume"
              title={isPaused ? 'Resume live logs' : 'Pause live logs'}
            >
              {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            </Button>
            
            <Button
              size="sm"
              variant="ghost"
              onClick={handleLastLog}
              disabled={logViewMode === 'browser'}
              className="h-6 w-6 p-0"
              data-testid="button-refresh"
              title={logViewMode === 'browser' ? 'Refresh not available for browser logs' : 'Refresh server logs'}
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
            
            {/* Enhanced Clipboard Button with Dropdown */}
            <div className="relative group">
              <Button
                size="sm"
                variant="ghost"
                onClick={copyAllLogs}
                className="h-6 w-6 p-0"
                data-testid="button-copy"
                title="Copy options"
              >
                <Copy className="h-3 w-3" />
              </Button>
              
              {/* Clipboard Options Dropdown */}
              <div className="absolute right-0 top-8 w-48 bg-popover border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <div className="p-2 space-y-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full justify-start text-xs"
                    onClick={copyAllLogs}
                  >
                    <Copy className="h-3 w-3 mr-2" />
                    Copy All Logs
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full justify-start text-xs"
                    onClick={() => setIsSelectionMode(!isSelectionMode)}
                  >
                    <Copy className="h-3 w-3 mr-2" />
                    Select & Copy
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full justify-start text-xs"
                    onClick={() => setShowRangeDialog(true)}
                  >
                    <Copy className="h-3 w-3 mr-2" />
                    Copy Range
                  </Button>
                  
                  {selectedLogIds.size > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full justify-start text-xs"
                      onClick={copySelectedLogs}
                    >
                      <Copy className="h-3 w-3 mr-2" />
                      Copy Selected ({selectedLogIds.size})
                    </Button>
                  )}
                </div>
              </div>
            </div>
            
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowSaveDialog(true)}
              className="h-6 w-6 p-0"
              data-testid="button-save"
              title="Save logs persistently"
            >
              <Archive className="h-3 w-3" />
            </Button>
            
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowSavedLogsDialog(true)}
              className="h-6 w-6 p-0"
              data-testid="button-saved-logs"
              title="View saved log collections"
            >
              <Clock className="h-3 w-3" />
            </Button>
            
            <Button
              size="sm"
              variant="ghost"
              onClick={toggleMaximize}
              className="h-6 w-6 p-0"
              data-testid="button-maximize"
            >
              {isMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="h-6 w-6 p-0"
              data-testid="button-close"
            >
              ×
            </Button>
          </div>
        </CardHeader>

        {/* Selection Mode Controls */}
        {isSelectionMode && (
          <div className="flex items-center justify-between px-4 py-2 bg-blue-50 dark:bg-blue-950 border-b">
            <div className="flex items-center space-x-2">
              <Button size="sm" variant="outline" onClick={selectAllLogs}>
                Select All
              </Button>
              <Button size="sm" variant="outline" onClick={clearSelection}>
                Clear Selection
              </Button>
            </div>
            <div className="flex items-center space-x-2">
              {selectedLogIds.size > 0 && (
                <Button size="sm" onClick={copySelectedLogs}>
                  Copy Selected ({selectedLogIds.size})
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setIsSelectionMode(false)}>
                Exit Selection
              </Button>
            </div>
          </div>
        )}

        {/* Enhanced Logs Content with Mobile Controls */}
        <CardContent className="p-0 flex-1 overflow-hidden relative">
          {/* Mobile-Friendly Scroll Controls */}
          <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0 bg-background/80 backdrop-blur-sm"
              onClick={() => {
                if (logsContainerRef.current) {
                  logsContainerRef.current.scrollTop = 0;
                }
              }}
              title="Scroll to top (newest)"
            >
              ↑
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0 bg-background/80 backdrop-blur-sm"
              onClick={() => {
                if (logsContainerRef.current) {
                  logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
                }
              }}
              title="Scroll to bottom (oldest)"
            >
              ↓
            </Button>
          </div>
          
          <div 
            ref={logsContainerRef}
            className="h-full overflow-y-auto overscroll-contain"
            style={{ 
              scrollBehavior: 'smooth',
              WebkitOverflowScrolling: 'touch'
            }}
            data-testid="logs-container"
          >
            {currentLogs.length === 0 ? (
              <div className="text-center text-gray-500 mt-8 p-4">
                <div className="text-lg mb-2">No logs available</div>
                <div className="text-sm">Waiting for real-time logs...</div>
              </div>
            ) : (
              <div className="space-y-1 p-2 pb-16">
                {currentLogs.slice().reverse().map((log, index) => {
                  const entryNumber = currentLogs.length - index;
                  return (
                  <div 
                      key={log.id || index} 
                      className={`
                        border rounded-lg p-3 transition-all duration-200 hover:shadow-sm cursor-pointer touch-manipulation
                        ${selectedLogIds.has(log.id) ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950' : 'bg-white dark:bg-gray-900'}
                        ${getLogLevelColor(log.level)}
                      `}
                      onClick={() => isSelectionMode ? toggleLogSelection(log.id) : copySpecificLog(log)}
                      onTouchStart={(e) => {
                        // Add touch feedback
                        e.currentTarget.style.transform = 'scale(0.98)';
                      }}
                      onTouchEnd={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                      data-testid={`log-entry-${index}`}
                      title={isSelectionMode ? "Tap to select/deselect" : "Tap to copy this log entry"}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {/* Log Header with Entry Number */}
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <Badge variant="secondary" className="text-xs font-mono">
                              #{entryNumber}
                            </Badge>
                            <Badge className={`text-xs ${getLogLevelBadgeColor(log.level)}`}>
                              {log.level.toUpperCase()}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {log.source}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(log.timestamp)}
                            </span>
                            {isSelectionMode && (
                              <div className={`w-6 h-6 rounded border-2 flex items-center justify-center touch-manipulation ${selectedLogIds.has(log.id) ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                                {selectedLogIds.has(log.id) && (
                                  <div className="text-white text-xs">✓</div>
                                )}
                              </div>
                            )}
                          </div>
                        
                        {/* Log Message */}
                        <div className="text-sm break-words font-mono leading-relaxed">
                          {log.message}
                        </div>
                        
                        {/* Metadata */}
                        {log.metadata && (
                          <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs font-mono text-muted-foreground">
                            {typeof log.metadata === 'string' ? log.metadata : JSON.stringify(log.metadata, null, 2)}
                          </div>
                        )}
                      </div>
                      
                      {/* Quick Copy Button - Always visible on mobile */}
                        {!isSelectionMode && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity h-8 w-8 p-0 touch-manipulation"
                            onClick={(e) => {
                              e.stopPropagation();
                              copySpecificLog(log);
                            }}
                            title="Copy this log entry"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>

        {/* Resize Handle */}
        {!isMaximized && (
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize bg-muted hover:bg-muted-foreground/20 transition-colors"
            onMouseDown={handleResizeMouseDown}
            onTouchStart={handleResizeTouchStart}
            data-testid="resize-handle"
          >
            <GripVertical className="h-3 w-3 rotate-90" />
          </div>
        )}
      </div>

      {/* Save Logs Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="z-[1001]">
          <DialogHeader>
            <DialogTitle>Save Current Logs</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="logName">Collection Name</Label>
              <Input
                id="logName"
                value={saveLogName}
                onChange={(e) => setSaveLogName(e.target.value)}
                placeholder="Enter a name for this log collection"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              This will save {currentLogs.length} log entries persistently, surviving server restarts and page refreshes.
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                Cancel
              </Button>
              <Button onClick={saveCurrentLogs}>
                Save Logs
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Range Copy Dialog */}
      <Dialog open={showRangeDialog} onOpenChange={setShowRangeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy Log Range</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="rangeStart">Start Entry #</Label>
                <Input
                  id="rangeStart"
                  type="number"
                  min="1"
                  max={currentLogs.length}
                  value={rangeStart || ''}
                  onChange={(e) => setRangeStart(parseInt(e.target.value) || null)}
                  placeholder="1"
                />
              </div>
              <div>
                <Label htmlFor="rangeEnd">End Entry #</Label>
                <Input
                  id="rangeEnd"
                  type="number"
                  min="1"
                  max={currentLogs.length}
                  value={rangeEnd || ''}
                  onChange={(e) => setRangeEnd(parseInt(e.target.value) || null)}
                  placeholder={currentLogs.length.toString()}
                />
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              Total entries available: {currentLogs.length}. Entries are numbered from oldest (1) to newest ({currentLogs.length}).
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowRangeDialog(false)}>
                Cancel
              </Button>
              <Button onClick={copyRangeLogs}>
                Copy Range
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Saved Logs Dialog */}
      <Dialog open={showSavedLogsDialog} onOpenChange={setShowSavedLogsDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] z-[1001]">
          <DialogHeader>
            <DialogTitle>Saved Log Collections</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {savedLogCollections.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No saved log collections yet. Save current logs to create persistent backups.
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {savedLogCollections.map((collection) => (
                  <div key={collection.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium">{collection.name}</h3>
                        <div className="text-sm text-muted-foreground">
                          {collection.totalEntries} entries • Saved {formatTimestamp(collection.savedAt)}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => loadSavedLogs(collection)}
                        >
                          Load
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => exportSavedLogs(collection)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteSavedLogs(collection.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setShowSavedLogsDialog(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
