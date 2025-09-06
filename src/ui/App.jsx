import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, Legend as RLegend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from 'recharts';
import {
  AppBar, Toolbar, Typography, Container, Grid, Paper, Box,
  Button, TextField, MenuItem, Select, FormControl, InputLabel,
  Card, CardHeader, CardContent, Stack, Divider, Backdrop, CircularProgress
} from '@mui/material';
import UploadIcon from '@mui/icons-material/Upload';

export default function App() {
  const [files, setFiles] = useState({});
  const [analysis, setAnalysis] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState('gemini');
  const [model, setModel] = useState('');

  const handleFileChange = (e) => {
    const { name, files: fileList } = e.target;
    setFiles(prev => ({ ...prev, [name]: fileList[0] }));
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setAnalysis('');
    const formData = new FormData();
    Object.entries(files).forEach(([type, file]) => {
      if (file) formData.append(type, file);
    });
  formData.append('provider', provider);
  if (model) formData.append('model', model);
    const res = await fetch('/api/analyze', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text();
      setAnalysis(`Error: ${res.status} ${text}`);
    } else {
      const data = await res.json();
      setAnalysis(data.analysis || data.error || 'No analysis');
      setResults(data.results || null);
    }
    setLoading(false);
  };

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'];

  const threadStateData = results?.jstack?.summary?.byState
    ? Object.entries(results.jstack.summary.byState)
        .map(([name, value]) => ({ name, value }))
        .filter(d => d.value > 0)
    : [];

  const topClassesData = results?.jmap?.summary?.topByBytes || [];
  const topFunctionsData = results?.flame?.summary?.topFunctions || [];

  return (
    <Box sx={{ flexGrow: 1, bgcolor: '#f8fafc', minHeight: '100vh' }}>
      <AppBar position="static" color="default" elevation={1} sx={{ bgcolor: '#ffffff' }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>JVM Diagnostics Dashboard</Typography>
        </Toolbar>
      </AppBar>
      <Container sx={{ py: 3 }}>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          Upload jstack, jmap and flame graph files to visualize hotspots and memory usage.
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardHeader title="Upload & Settings" />
              <CardContent>
                <Stack spacing={2}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <Button variant="outlined" component="label" startIcon={<UploadIcon />} fullWidth>
                      jstack
                      <input type="file" hidden name="jstack" accept=".jstack,.txt" onChange={handleFileChange} />
                    </Button>
                    <Button variant="outlined" component="label" startIcon={<UploadIcon />} fullWidth>
                      jmap
                      <input type="file" hidden name="jmap" accept=".jmap,.txt" onChange={handleFileChange} />
                    </Button>
                    <Button variant="outlined" component="label" startIcon={<UploadIcon />} fullWidth>
                      flame
                      <input type="file" hidden name="flame" accept=".txt,.folded,.fp" onChange={handleFileChange} />
                    </Button>
                  </Stack>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <FormControl fullWidth>
                      <InputLabel id="provider-label">Provider</InputLabel>
                      <Select labelId="provider-label" label="Provider" value={provider} onChange={(e)=>{ setProvider(e.target.value); setModel(''); }}>
                        <MenuItem value="gemini">Gemini</MenuItem>
                        <MenuItem value="ollama">Ollama</MenuItem>
                      </Select>
                    </FormControl>
                    <TextField label="Model (optional)" placeholder={provider==='gemini' ? 'gemini-1.5-pro' : 'llama3'} value={model} onChange={(e)=>setModel(e.target.value)} helperText={provider==='ollama' ? 'Ensure model exists in Ollama: e.g., ollama pull llama3' : 'Requires GEMINI_API_KEY'} fullWidth />
                  </Stack>
                  <Box>
                    <Button variant="contained" onClick={handleAnalyze} disabled={loading}>
                      {loading ? 'Analyzing…' : 'Analyze'}
                    </Button>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardHeader title="Quick Summary" />
              <CardContent>
                <Stack spacing={1} divider={<Divider flexItem />}>
                  <Box>
                    <Typography variant="subtitle2">jstack</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {results?.jstack ? (
                        <>Threads: {results.jstack.summary?.totalThreads ?? 0}, Blocked: {results.jstack.summary?.byState?.BLOCKED ?? 0}, Monitor waits: {results.jstack.summary?.blockedByMonitor ?? 0}</>
                      ) : 'no file uploaded'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="subtitle2">jmap</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {results?.jmap ? (
                        <>Total bytes: {results.jmap.summary?.totalBytes ?? 0}, Top classes: {(results.jmap.summary?.topByBytes?.length ?? 0)}</>
                      ) : 'no file uploaded'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="subtitle2">flame</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {results?.flame ? (
                        <>Total samples: {results.flame.summary?.totalSamples ?? 0}, Top functions: {(results.flame.summary?.topFunctions?.length ?? 0)}</>
                      ) : 'no file uploaded'}
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardHeader title="Thread States" />
              <CardContent sx={{ height: 340 }}>
                {results?.jstack ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie dataKey="value" data={threadStateData} outerRadius={110} label>
                        {threadStateData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RTooltip />
                      <RLegend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <Typography color="text.secondary">Upload a jstack file to see thread states.</Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardHeader title="Top Classes by Bytes (jmap)" />
              <CardContent sx={{ height: 340 }}>
                {results?.jmap ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topClassesData} margin={{ left: 8, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="className" hide />
                      <YAxis />
                      <RTooltip />
                      <Bar dataKey="bytes" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Typography color="text.secondary">Upload a jmap -histo file to see top classes.</Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Card>
              <CardHeader title="Top Leaf Functions (flame)" />
              <CardContent sx={{ height: 380 }}>
                {topFunctionsData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topFunctionsData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" hide />
                      <YAxis />
                      <RTooltip />
                      <Bar dataKey="samples" fill="#f97316" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Typography color="text.secondary">No flame data parsed.</Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Card>
              <CardHeader title="LLM Analysis" />
              <CardContent>
                <Box sx={{ color: 'text.primary' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysis || 'No analysis yet.'}</ReactMarkdown>
                </Box>
                <Box sx={{ mt: 1 }}>
                  <details>
                    <summary>Show raw text</summary>
                    <textarea value={analysis} readOnly rows={10} style={{ width: '100%', marginTop: 8, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace' }} />
                  </details>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
      <Backdrop sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }} open={loading}>
        <CircularProgress color="inherit" />
      </Backdrop>
    </Box>
  );
}
