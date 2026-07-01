import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, RefreshCw, UploadCloud } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { api, type ImportOrdersResponse, type ImportPreviewResponse } from '../lib/api';
import { cn } from '../lib/cn';

const currency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const SummaryCard = ({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'success' | 'warning' | 'danger' }) => (
  <Card
    className={cn(
      'p-5',
      tone === 'success' && 'border-emerald-400/30 bg-emerald-400/7',
      tone === 'warning' && 'border-amber-400/30 bg-amber-400/7',
      tone === 'danger' && 'border-rose-400/30 bg-rose-400/7',
    )}
  >
    <p className="text-sm font-semibold text-slate-400">{label}</p>
    <p className="mt-2 text-3xl font-black text-white">{value}</p>
  </Card>
);

export const ImportOrdersPage = () => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [result, setResult] = useState<ImportOrdersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const step = result ? 'done' : preview ? 'preview' : 'upload';

  useEffect(() => {
    if (!loading) return;
    const timer = window.setInterval(() => {
      setProgress((current) => Math.min(current + 8, 90));
    }, 250);
    return () => window.clearInterval(timer);
  }, [loading]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selected = acceptedFiles[0];
    if (!selected) return;
    setFile(selected);
    setPreview(null);
    setResult(null);
    setMessage(null);
    setProgress(0);
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
    noClick: true,
  });

  const canImport = useMemo(() => Boolean(preview && preview.validRows > 0 && !loading), [loading, preview]);

  const handlePreview = async () => {
    if (!file) return;
    setLoading(true);
    setProgress(15);
    setMessage(null);
    try {
      const data = await api.previewOrderImport(file);
      setPreview(data);
      setResult(null);
      setProgress(100);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível analisar a planilha.' });
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setProgress(10);
    setMessage(null);
    try {
      const data = await api.importOrders(file);
      setResult(data);
      setProgress(100);
      setMessage({ type: 'success', text: 'Pedidos importados com sucesso.' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível importar os pedidos.' });
    } finally {
      setLoading(false);
    }
  };

  const handleTemplate = async () => {
    setMessage(null);
    try {
      const blob = await api.downloadOrderImportTemplate();
      saveBlob(blob, 'modelo-pedidos-siou.xlsx');
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível baixar o modelo.' });
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setMessage(null);
    setProgress(0);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar pedidos"
        description="Traga pedidos antigos para o CRM entender melhor seus clientes."
        actions={
          <Button variant="secondary" onClick={handleTemplate}>
            <Download className="h-4 w-4" />
            Baixar modelo
          </Button>
        }
      />

      {message && (
        <div
          className={cn(
            'rounded-2xl border px-5 py-4 text-sm font-semibold',
            message.type === 'success' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100' : 'border-rose-400/30 bg-rose-400/10 text-rose-100',
          )}
        >
          {message.text}
        </div>
      )}

      {step === 'upload' && (
        <Card className="p-6">
          <div
            {...getRootProps()}
            className={cn(
              'flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-white/[0.03] p-8 text-center transition',
              isDragActive && 'border-neon bg-neon/10',
            )}
          >
            <input {...getInputProps()} />
            <UploadCloud className="h-12 w-12 text-neon" />
            <h2 className="mt-4 text-2xl font-black text-white">Solte sua planilha aqui</h2>
            <p className="mt-2 max-w-xl text-sm text-slate-400">Use uma planilha .xlsx ou .csv. Nome, telefone e produto são suficientes; o que faltar fica em branco.</p>
            {file ? (
              <p className="mt-4 rounded-full border border-neon/30 bg-neon/10 px-4 py-2 text-sm font-bold text-sky-100">{file.name}</p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button variant="secondary" onClick={open} type="button">
                <FileSpreadsheet className="h-4 w-4" />
                Escolher arquivo
              </Button>
              <Button onClick={handlePreview} disabled={!file || loading}>
                Analisar planilha
              </Button>
            </div>
          </div>
        </Card>
      )}

      {step === 'preview' && preview && (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <SummaryCard label="Total encontrado" value={preview.totalRows} />
            <SummaryCard label="Prontos para importar" value={preview.validRows} tone="success" />
            <SummaryCard label="Repetidos" value={preview.duplicateRows} tone="warning" />
            <SummaryCard label="Com problema" value={preview.invalidRows} tone="danger" />
          </div>

          <Card className="p-5">
            <p className="text-sm font-semibold text-slate-400">Valor total encontrado</p>
            <p className="mt-2 text-4xl font-black text-white">{currency(preview.estimatedTotal)}</p>
          </Card>

          {preview.errors.length > 0 && (
            <Card className="border-amber-400/30 bg-amber-400/7 p-5">
              <div className="flex items-center gap-2 text-amber-100">
                <AlertTriangle className="h-5 w-5" />
                <h2 className="text-lg font-black">Algumas linhas precisam de ajuste</h2>
              </div>
              <div className="mt-4 max-h-48 space-y-2 overflow-y-auto text-sm text-slate-300">
                {preview.errors.map((error) => (
                  <p key={`${error.row}-${error.reason}`}>Linha {error.row}: {error.reason}</p>
                ))}
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="border-b border-line p-5">
              <h2 className="text-lg font-black text-white">Primeiros pedidos encontrados</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-slate-400">
                  <tr>
                    <th className="px-5 py-3">Cliente</th>
                    <th className="px-5 py-3">Telefone</th>
                    <th className="px-5 py-3">Produto</th>
                    <th className="px-5 py-3">Qtd.</th>
                    <th className="px-5 py-3">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((order, index) => (
                    <tr key={`${order.customer_phone}-${order.product}-${index}`} className="border-t border-line text-slate-200">
                      <td className="px-5 py-3 font-semibold text-white">{order.customer_name}</td>
                      <td className="px-5 py-3">{order.customer_phone}</td>
                      <td className="px-5 py-3">{order.product}</td>
                      <td className="px-5 py-3">{order.quantity}</td>
                      <td className="px-5 py-3">{currency(order.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {loading && (
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-neon transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={reset} disabled={loading}>
              Trocar arquivo
            </Button>
            <Button onClick={handleImport} disabled={!canImport}>
              {loading ? 'Importando...' : `Importar ${preview.validRows} pedidos`}
            </Button>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <Card className="p-6">
          <div className="flex items-center gap-3 text-emerald-100">
            <CheckCircle2 className="h-8 w-8" />
            <h2 className="text-2xl font-black">Importação concluída</h2>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <SummaryCard label="Pedidos importados" value={result.imported} tone="success" />
            <SummaryCard label="Clientes novos" value={result.customersCreated} />
            <SummaryCard label="Repetidos ignorados" value={result.duplicatesSkipped} tone="warning" />
            <SummaryCard label="Com erro" value={result.errors + result.invalidRows} tone={result.errors + result.invalidRows ? 'danger' : 'default'} />
          </div>
          {result.errorDetails.length > 0 && (
            <div className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">
              {result.errorDetails.map((error) => (
                <p key={`${error.product}-${error.reason}`}>{error.product}: {error.reason}</p>
              ))}
            </div>
          )}
          <Button className="mt-6" onClick={reset}>
            <RefreshCw className="h-4 w-4" />
            Importar outra planilha
          </Button>
        </Card>
      )}
    </div>
  );
};
