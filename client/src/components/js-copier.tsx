import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Forward, Play, Square, Activity, Terminal, 
  AlertTriangle, CheckCircle, Copy, Trash2, Plus, Save, FileText, Edit3, X 
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { storage } from '@/lib/storage';
import type { Chat } from '@shared/schema';

interface ForwardPair {
  id: string;
  name: string;
  fromChat: string;
  toChat: string;
  fromOffset: number;
  toOffset: number;
  currentOffset: number;
  status: 'pending' | 'running' | 'paused' | 'completed';
  isActive: boolean;
}

interface JSCopierStatus {
  running: boolean;
  currentPair?: string;
  lastActivity: string | null;
  processedMessages: number;
  totalPairs: number;
  isPaused: boolean;
  sessionValid: boolean;
  currentUserInfo?: {
    id: number;
    username: string;
    firstName: string;
  };
}

export function JSCopier() {
  const [forwardPairs, setForwardPairs] = useState<ForwardPair[]>([]);
  const [newPairName, setNewPairName] = useState('');
  const [selectedFromChat, setSelectedFromChat] = useState<string>('');
  const [selectedToChat, setSelectedToChat] = useState<string>('');
  const [newFromOffset, setNewFromOffset] = useState<number>(0);
  const [newToOffset, setNewToOffset] = useState<number>(0);
  const [showLogs, setShowLogs] = useState(false);
  const [configContent, setConfigContent] = useState('');
  const [sessionString, setSessionString] = useState('1BVtsOLABux3cdf9iA7_7csD0HjZ-vqy3pQUfbynyLah5ZQQNGCTgc6ao1FOFHur4mvJkRsrzS3KKi65RNXczTxtlxpNIkqoIQvN0ILt2kPp9dUcCuIn8ZlFftx63derTrb_LS6TdeZ4Ly3cI26C_E14TUvhlWNHwB_zDZ1mvpvluQb9EhodVRsWSAQimUWNIrKp9stJum7amnoLzCSdqAydjsfTXej1KZQ1TfxX79yAb-DPIw2kzFWf6Mk9ScDlTeGJg6qRQkiDOHiRrUnrzle1REurAN_4h9qWahhR1ffbreGvOYVDip35Uya4Kn4YGmJM0vtGLq3HoEico3umwBrO6GOc0oxU=');
  const [editingPair, setEditingPair] = useState<ForwardPair | null>(null);
  const [loginStatus, setLoginStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [editableConfigContent, setEditableConfigContent] = useState('');
  const [showLastLog, setShowLastLog] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch chats from storage for dropdowns
  const { data: chats = [], isLoading: chatsLoading } = useQuery<Chat[]>({
    queryKey: ['chats'],
    queryFn: async () => {
      return await storage.getChats();
    },
  });

  // Fetch copier status
  const { data: statusData, isLoading } = useQuery({
    queryKey: ['js-copier-status'],
    queryFn: async () => {
      const response = await fetch('/api/js-copier/status');
      if (!response.ok) throw new Error('Failed to fetch status');
      return response.json();
    },
    refetchInterval: 2000, // Poll every 2 seconds
  });

  // Fetch logs
  const { data: logsData } = useQuery({
    queryKey: ['js-copier-logs'],
    queryFn: async () => {
      const response = await fetch('/api/js-copier/logs');
      if (!response.ok) throw new Error('Failed to fetch logs');
      return response.json();
    },
    refetchInterval: 3000, // Poll every 3 seconds
    enabled: showLogs,
  });

  // Load config
  const { data: configData } = useQuery({
    queryKey: ['js-copier-config'],
    queryFn: async () => {
      const response = await fetch('/api/js-copier/config');
      if (!response.ok) throw new Error('Failed to fetch config');
      return response.json();
    },
  });

  // Fetch last forwarding log
  const { data: lastLogData, refetch: refetchLastLog } = useQuery({
    queryKey: ['js-copier-last-log'],
    queryFn: async () => {
      const response = await fetch('/api/js-copier/last-log');
      if (!response.ok) throw new Error('Failed to fetch last log');
      return response.json();
    },
  });

  useEffect(() => {
    if (configData?.pairs) {
      setForwardPairs(configData.pairs);
    }
    if (configData?.configContent) {
      setConfigContent(configData.configContent);
    }
  }, [configData]);

  const status: JSCopierStatus = statusData?.status || {
    running: false,
    currentPair: undefined,
    lastActivity: null,
    processedMessages: 0,
    totalPairs: 0
  };

  // Test session string login
  const testSessionMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/js-copier/test-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionString: sessionString.trim() }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to test session');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setLoginStatus('success');
      toast({ 
        title: 'Session Valid! ✅', 
        description: `Logged in as ${data.userInfo.firstName} (@${data.userInfo.username}) - ID: ${data.userInfo.id}` 
      });
      queryClient.invalidateQueries({ queryKey: ['js-copier-status'] });
    },
    onError: (error: Error) => {
      setLoginStatus('error');
      toast({ 
        title: 'Session Invalid ❌', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
    onMutate: () => {
      setLoginStatus('testing');
    }
  });

  // Add new forward pair
  const addForwardPair = () => {
    if (!newPairName || !selectedFromChat || !selectedToChat) {
      toast({ 
        title: 'Missing Information', 
        description: 'Please provide pair name, from chat, and to chat', 
        variant: 'destructive' 
      });
      return;
    }

    const newPair: ForwardPair = {
      id: Date.now().toString(),
      name: newPairName,
      fromChat: selectedFromChat,
      toChat: selectedToChat,
      fromOffset: newFromOffset,
      toOffset: newToOffset || 0,
      currentOffset: newFromOffset,
      status: 'pending',
      isActive: true
    };

    setForwardPairs([...forwardPairs, newPair]);
    setNewPairName('');
    setSelectedFromChat('');
    setSelectedToChat('');
    setNewFromOffset(0);
    setNewToOffset(0);

    toast({ title: 'Forward Pair Added', description: `Added "${newPairName}" forwarding configuration` });
  };

  // Edit forward pair
  const editPair = (pair: ForwardPair) => {
    setEditingPair(pair);
  };

  // Save edited pair
  const saveEditedPair = (updatedPair: ForwardPair) => {
    setForwardPairs(forwardPairs.map(pair => 
      pair.id === updatedPair.id ? updatedPair : pair
    ));
    setEditingPair(null);
    toast({ title: 'Forward Pair Updated', description: 'Forwarding configuration updated' });
  };

  // Remove forward pair
  const removePair = (id: string) => {
    setForwardPairs(forwardPairs.filter(pair => pair.id !== id));
    toast({ title: 'Forward Pair Removed', description: 'Forwarding configuration removed' });
  };

  // Start individual pair
  const startIndividualPair = useMutation({
    mutationFn: async (pairId: string) => {
      const response = await fetch('/api/js-copier/start-pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pairId,
          sessionString: sessionString.trim()
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start pair');
      }
      
      return response.json();
    },
    onSuccess: (_, pairId) => {
      const pairName = forwardPairs.find(p => p.id === pairId)?.name;
      toast({ 
        title: 'Individual Pair Started', 
        description: `Started forwarding for "${pairName}"` 
      });
      queryClient.invalidateQueries({ queryKey: ['js-copier-status'] });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to Start Pair', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Pause copier
  const pauseCopierMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/js-copier/pause', {
        method: 'POST',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to pause copier');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'JS Copier Paused', description: 'Message forwarding has been paused. Progress saved.' });
      queryClient.invalidateQueries({ queryKey: ['js-copier-status'] });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to Pause Copier', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Resume copier
  const resumeCopierMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/js-copier/resume', {
        method: 'POST',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to resume copier');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'JS Copier Resumed', description: 'Message forwarding has been resumed from saved offset.' });
      queryClient.invalidateQueries({ queryKey: ['js-copier-status'] });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to Resume Copier', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Save config mutation
  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      // Always use the properly formatted config content from frontend
      const formattedConfigContent = generateConfigContent();
      
      const response = await fetch('/api/js-copier/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pairs: forwardPairs,
          configContent: formattedConfigContent
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save config');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Configuration Saved', description: 'config.ini has been saved successfully' });
      queryClient.invalidateQueries({ queryKey: ['js-copier-config'] });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to Save Config', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Save custom config mutation
  const saveCustomConfigMutation = useMutation({
    mutationFn: async (configContent: string) => {
      const response = await fetch('/api/js-copier/config/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configContent }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save custom config');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Custom Config Saved', description: 'Your edited configuration has been saved successfully' });
      setIsEditingConfig(false);
      queryClient.invalidateQueries({ queryKey: ['js-copier-config'] });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to Save Custom Config', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Start copier mutation
  const startCopierMutation = useMutation({
    mutationFn: async () => {
      if (!sessionString.trim()) {
        throw new Error('Session string is required. Please enter your session string.');
      }

      // Always use the properly formatted config content
      const formattedConfigContent = generateConfigContent();

      const response = await fetch('/api/js-copier/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pairs: forwardPairs,
          sessionString: sessionString.trim(),
          configContent: formattedConfigContent
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start copier');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({ 
        title: 'JS Copier Started', 
        description: 'Message forwarding has started using your existing session!' 
      });
      queryClient.invalidateQueries({ queryKey: ['js-copier-status'] });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to Start Copier', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Stop copier mutation
  const stopCopierMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/js-copier/stop', {
        method: 'POST',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to stop copier');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'JS Copier Stopped', description: 'Message forwarding has been stopped.' });
      queryClient.invalidateQueries({ queryKey: ['js-copier-status'] });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to Stop Copier', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Clear logs mutation
  const clearLogsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/js-copier/clear-logs', {
        method: 'POST',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to clear logs');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Logs Cleared', description: 'All copier logs have been cleared successfully.' });
      queryClient.invalidateQueries({ queryKey: ['js-copier-logs'] });
      queryClient.invalidateQueries({ queryKey: ['js-copier-status'] });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to Clear Logs', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Helper functions for config editing
  const startEditingConfig = () => {
    const currentConfig = generateConfigContent();
    setEditableConfigContent(currentConfig);
    setIsEditingConfig(true);
  };

  const cancelEditingConfig = () => {
    setIsEditingConfig(false);
    setEditableConfigContent('');
  };

  const saveCustomConfig = () => {
    if (!editableConfigContent.trim()) {
      toast({
        title: 'Invalid config',
        description: 'Config content cannot be empty',
        variant: 'destructive'
      });
      return;
    }
    saveCustomConfigMutation.mutate(editableConfigContent);
  };

  const formatChatIdForGramJS = (chatId: string): string => {
    const chat = chats.find(c => c.id === chatId);
    
    if (!chat) {
      return chatId; // fallback to original ID
    }

    // ALWAYS prefer username if available (most reliable for GramJS)
    if (chat.username) {
      return `@${chat.username}`;
    }

    // For chats without usernames, use ID format
    switch (chat.type) {
      case 'channel':
      case 'group':
        // For supergroups and channels without username, use -100 prefix
        let id = chat.id;
        
        if (id.startsWith('-100')) {
          return id;
        } else if (id.startsWith('-')) {
          return id; // already has negative prefix  
        } else {
          // Convert to supergroup format with -100 prefix
          return `-100${id}`;
        }
        
      case 'private':
        // For private chats, use the raw ID
        return chat.id;
        
      default:
        return chat.id;
    }
  };

  const generateConfigContent = () => {
    let content = '; Telegram Chat Direct Copier Configuration (JavaScript/GramJS)\n';
    content += '; Generated by Telegram Manager - JS Copier\n\n';
    
    forwardPairs.forEach(pair => {
      const fromFormatted = formatChatIdForGramJS(pair.fromChat);
      const toFormatted = formatChatIdForGramJS(pair.toChat);
      
      content += `[${pair.name}]\n`;
      content += `from = ${fromFormatted}\n`;
      content += `to = ${toFormatted}\n`;
      content += `offset = ${pair.currentOffset || 0}\n\n`;
    });
    
    return content;
  };

  const getChatName = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    return chat ? chat.title : chatId;
  };

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-yellow-500 rounded-lg flex items-center justify-center">
          <Forward className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">⚡ JS Copier</h1>
          <p className="text-muted-foreground">
            Forward messages between chats using Node.js/GramJS with exact same functionality as Python Copier
          </p>
        </div>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Copier Status
            {status.running ? (
              <Badge variant="default" className="ml-auto">
                <CheckCircle className="w-3 h-3 mr-1" />
                Running
              </Badge>
            ) : (
              <Badge variant="secondary" className="ml-auto">
                <Square className="w-3 h-3 mr-1" />
                Stopped
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status.running && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Current Pair:</span> {status.currentPair || 'None'}
              </div>
              <div>
                <span className="font-medium">Processed Messages:</span> {status.processedMessages}
              </div>
              <div>
                <span className="font-medium">Total Pairs:</span> {status.totalPairs}
              </div>
              <div>
                <span className="font-medium">Last Activity:</span> {formatTime(status.lastActivity)}
              </div>
              <div className="col-span-2">
                <span className="font-medium text-green-600">✅ Using GramJS string session (no authentication prompt needed)</span>
              </div>
              {status.isPaused && (
                <div className="col-span-2">
                  <span className="font-medium text-yellow-600">⏸️ Forwarding is paused - click Resume to continue</span>
                </div>
              )}
            </div>
          )}

          {/* Session String Configuration */}
          <div className="space-y-3">
            <Label htmlFor="sessionString">Telegram Session String</Label>
            <Textarea
              id="sessionString"
              placeholder="Enter your Telegram session string here..."
              value={sessionString}
              onChange={(e) => {
                setSessionString(e.target.value);
                setLoginStatus('idle');
              }}
              className="min-h-[100px] font-mono text-xs"
              data-testid="input-session-string"
            />
            
            <div className="flex gap-2 items-center">
              <Button
                onClick={() => testSessionMutation.mutate()}
                disabled={testSessionMutation.isPending || !sessionString.trim()}
                variant={loginStatus === 'success' ? 'default' : 'outline'}
                size="sm"
                data-testid="button-test-session"
              >
                {testSessionMutation.isPending ? 'Testing...' : 
                 loginStatus === 'success' ? '✅ Session Valid' : 
                 loginStatus === 'error' ? '❌ Test Session' : '🔐 Test & Login'}
              </Button>
              
              {loginStatus === 'success' && status.currentUserInfo && (
                <div className="text-xs text-muted-foreground">
                  Logged in as <strong>{status.currentUserInfo.firstName}</strong> (@{status.currentUserInfo.username}) - ID: {status.currentUserInfo.id}
                </div>
              )}
            </div>
            
            <p className="text-xs text-muted-foreground">
              This session string will be used to authenticate with Telegram via GramJS without requiring login prompts.
              Click "Test & Login" to verify your session and see account details.
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLogs(!showLogs)}
              data-testid="button-toggle-logs"
            >
              <Terminal className="w-4 h-4 mr-2" />
              {showLogs ? 'Hide' : 'Show'} Logs
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLastLog(true)}
              data-testid="button-show-last-log"
            >
              <FileText className="w-4 h-4 mr-2" />
              Last Log
            </Button>
            
            {status.running && status.isPaused && (
              <Button
                onClick={() => resumeCopierMutation.mutate()}
                disabled={resumeCopierMutation.isPending}
                variant="outline"
                size="sm"
                data-testid="button-resume-copier"
              >
                <Play className="w-4 h-4 mr-2" />
                {resumeCopierMutation.isPending ? 'Resuming...' : 'Resume'}
              </Button>
            )}
            
            {status.running && !status.isPaused && (
              <Button
                onClick={() => pauseCopierMutation.mutate()}
                disabled={pauseCopierMutation.isPending}
                variant="outline"
                size="sm"
                data-testid="button-pause-copier"
              >
                <Square className="w-4 h-4 mr-2" />
                {pauseCopierMutation.isPending ? 'Pausing...' : 'Pause'}
              </Button>
            )}
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearLogsMutation.mutate()}
              disabled={clearLogsMutation.isPending}
              data-testid="button-clear-logs"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {clearLogsMutation.isPending ? 'Clearing...' : 'Clear Logs'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Forward Pairs Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Forward className="w-5 h-5" />
            Forward Pairs Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add New Pair */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 border rounded-lg">
            <div className="space-y-2">
              <Label htmlFor="pairName">Pair Name</Label>
              <Input
                id="pairName"
                placeholder="e.g., News to Archive"
                value={newPairName}
                onChange={(e) => setNewPairName(e.target.value)}
                data-testid="input-pair-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="fromChat">From Chat</Label>
              <Select value={selectedFromChat} onValueChange={setSelectedFromChat}>
                <SelectTrigger data-testid="select-from-chat">
                  <SelectValue placeholder="Select source chat" />
                </SelectTrigger>
                <SelectContent>
                  {chats.map((chat) => (
                    <SelectItem key={chat.id} value={chat.id}>
                      {chat.title} ({chat.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="toChat">To Chat</Label>
              <Select value={selectedToChat} onValueChange={setSelectedToChat}>
                <SelectTrigger data-testid="select-to-chat">
                  <SelectValue placeholder="Select destination chat" />
                </SelectTrigger>
                <SelectContent>
                  {chats.map((chat) => (
                    <SelectItem key={chat.id} value={chat.id}>
                      {chat.title} ({chat.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="fromOffset">From Offset</Label>
              <Input
                id="fromOffset"
                type="number"
                placeholder="0"
                value={newFromOffset}
                onChange={(e) => setNewFromOffset(Number(e.target.value) || 0)}
                data-testid="input-from-offset"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="toOffset">To Offset (Optional)</Label>
              <Input
                id="toOffset"
                type="number"
                placeholder="Latest message"
                value={newToOffset}
                onChange={(e) => setNewToOffset(Number(e.target.value) || 0)}
                data-testid="input-to-offset"
              />
            </div>
            
            <div className="flex items-end">
              <Button
                onClick={addForwardPair}
                disabled={!newPairName || !selectedFromChat || !selectedToChat}
                className="w-full"
                data-testid="button-add-pair"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Pair
              </Button>
            </div>
          </div>

          {/* Existing Pairs */}
          {forwardPairs.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium">Configured Forward Pairs:</h4>
              {forwardPairs.map((pair) => (
                <div key={pair.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 flex-1">
                    <div>
                      <span className="font-medium">{pair.name}</span>
                      <Badge variant="outline" className="ml-2">{pair.status}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      From: {getChatName(pair.fromChat)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      To: {getChatName(pair.toChat)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Offset: {pair.currentOffset}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startIndividualPair.mutate(pair.id)}
                      disabled={startIndividualPair.isPending || status.running}
                      data-testid={`button-start-individual-${pair.id}`}
                    >
                      <Play className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => editPair(pair)}
                      data-testid={`button-edit-${pair.id}`}
                    >
                      <Edit3 className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removePair(pair.id)}
                      disabled={status.running}
                      data-testid={`button-remove-${pair.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configuration File Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Configuration File (config.ini)
            <Button
              variant="outline"
              size="sm"
              onClick={() => saveConfigMutation.mutate()}
              disabled={saveConfigMutation.isPending || forwardPairs.length === 0}
              className="ml-auto"
              data-testid="button-save-config"
            >
              <Save className="w-4 h-4 mr-2" />
              {saveConfigMutation.isPending ? 'Saving...' : 'Save Config'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={startEditingConfig}
                disabled={isEditingConfig}
                data-testid="button-edit-config"
              >
                <Edit3 className="w-4 h-4 mr-2" />
                Edit Config
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const formatted = generateConfigContent();
                  setConfigContent(formatted);
                }}
                data-testid="button-regenerate-config"
              >
                <Copy className="w-4 h-4 mr-2" />
                Regenerate from Pairs
              </Button>
            </div>

            {isEditingConfig ? (
              <div className="space-y-3">
                <Textarea
                  value={editableConfigContent}
                  onChange={(e) => setEditableConfigContent(e.target.value)}
                  className="min-h-[200px] font-mono text-xs"
                  placeholder="Enter your custom configuration..."
                  data-testid="textarea-edit-config"
                />
                <div className="flex gap-2">
                  <Button
                    onClick={saveCustomConfig}
                    disabled={saveCustomConfigMutation.isPending}
                    data-testid="button-save-custom-config"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saveCustomConfigMutation.isPending ? 'Saving...' : 'Save Custom Config'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={cancelEditingConfig}
                    data-testid="button-cancel-edit-config"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Textarea
                value={configContent || generateConfigContent()}
                readOnly
                className="min-h-[200px] font-mono text-xs bg-muted"
                data-testid="textarea-config-display"
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            {!status.running ? (
              <Button
                onClick={() => startCopierMutation.mutate()}
                disabled={startCopierMutation.isPending || isLoading || forwardPairs.length === 0}
                className="flex-1"
                data-testid="button-start-copier"
              >
                <Play className="w-4 h-4 mr-2" />
                {startCopierMutation.isPending ? 'Starting...' : 'Start Forwarding'}
              </Button>
            ) : (
              <Button
                onClick={() => stopCopierMutation.mutate()}
                disabled={stopCopierMutation.isPending}
                variant="destructive"
                className="flex-1"
                data-testid="button-stop-copier"
              >
                <Square className="w-4 h-4 mr-2" />
                {stopCopierMutation.isPending ? 'Stopping...' : 'Stop Forwarding'}
              </Button>
            )}
          </div>
          
          {forwardPairs.length === 0 && (
            <p className="text-sm text-muted-foreground mt-2 text-center">
              Add at least one forward pair to start message copying
            </p>
          )}
        </CardContent>
      </Card>

      {/* Logs Card */}
      {showLogs && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="w-5 h-5" />
              Copier Logs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={logsData?.logs?.slice(-30).join('\n') || 'No logs available...'}
              readOnly
              className="min-h-[250px] font-mono text-xs bg-black text-green-400"
              data-testid="logs-display"
            />
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>⚡ JS Copier Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <h4 className="font-medium">✨ Core Features:</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Message forwarding between any chats</li>
                <li>• Automatic offset tracking (resume capability)</li>
                <li>• Multiple forward pair support</li>
                <li>• Real-time progress monitoring</li>
                <li>• Uses existing API credentials</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">🔧 Technical Details:</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Based on Node.js/GramJS instead of Python/Telethon</li>
                <li>• Preserves message order and content</li>
                <li>• Handles flood control automatically</li>
                <li>• Config.ini file management</li>
                <li>• Detailed logging and status reporting</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Last Log Dialog */}
      {showLastLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg w-full max-w-4xl mx-4 border max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Complete Last Forwarding Log</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowLastLog(false)}
                data-testid="button-close-last-log"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="flex-1 overflow-hidden">
              {lastLogData?.hasLog ? (
                <div className="space-y-4 h-full flex flex-col">
                  {/* Log Session Info */}
                  <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium">Config Name:</span> {lastLogData.log.configName}
                      </div>
                      <div>
                        <span className="font-medium">Status:</span>{' '}
                        <Badge variant={
                          lastLogData.log.status === 'completed' ? 'default' :
                          lastLogData.log.status === 'failed' ? 'destructive' : 'secondary'
                        }>
                          {lastLogData.log.status}
                        </Badge>
                      </div>
                      <div>
                        <span className="font-medium">Start Time:</span>{' '}
                        {new Date(lastLogData.log.startTime).toLocaleString()}
                      </div>
                      <div>
                        <span className="font-medium">End Time:</span>{' '}
                        {lastLogData.log.endTime ? new Date(lastLogData.log.endTime).toLocaleString() : 'Running...'}
                      </div>
                    </div>
                  </div>
                  
                  {/* Complete Log Output */}
                  <div className="flex-1 bg-black/90 p-4 rounded-lg overflow-y-auto font-mono text-xs text-green-400">
                    {lastLogData.log.logs.map((logLine: string, index: number) => (
                      <div key={index} className="whitespace-pre-wrap break-words">
                        {logLine}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Terminal className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    {lastLogData?.message || 'No previous forwarding log available'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Pair Dialog */}
      {editingPair && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg w-full max-w-md mx-4 border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Edit Forward Pair</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingPair(null)}
                data-testid="button-close-edit"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editPairName">Pair Name</Label>
                <Input
                  id="editPairName"
                  value={editingPair.name}
                  onChange={(e) => setEditingPair({...editingPair, name: e.target.value})}
                  data-testid="input-edit-pair-name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="editFromChat">From Chat</Label>
                <Select 
                  value={editingPair.fromChat} 
                  onValueChange={(value) => setEditingPair({...editingPair, fromChat: value})}
                >
                  <SelectTrigger data-testid="select-edit-from-chat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {chats.map((chat) => (
                      <SelectItem key={chat.id} value={chat.id}>
                        {chat.title} ({chat.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="editToChat">To Chat</Label>
                <Select 
                  value={editingPair.toChat} 
                  onValueChange={(value) => setEditingPair({...editingPair, toChat: value})}
                >
                  <SelectTrigger data-testid="select-edit-to-chat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {chats.map((chat) => (
                      <SelectItem key={chat.id} value={chat.id}>
                        {chat.title} ({chat.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="editFromOffset">From Offset</Label>
                  <Input
                    id="editFromOffset"
                    type="number"
                    value={editingPair.fromOffset}
                    onChange={(e) => setEditingPair({...editingPair, fromOffset: Number(e.target.value) || 0})}
                    data-testid="input-edit-from-offset"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="editToOffset">To Offset</Label>
                  <Input
                    id="editToOffset"
                    type="number"
                    value={editingPair.toOffset}
                    onChange={(e) => setEditingPair({...editingPair, toOffset: Number(e.target.value) || 0})}
                    data-testid="input-edit-to-offset"
                  />
                </div>
              </div>
              
              <div className="flex gap-2 justify-end pt-4">
                <Button
                  variant="outline"
                  onClick={() => setEditingPair(null)}
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => saveEditedPair(editingPair)}
                  data-testid="button-save-edit"
                >
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}