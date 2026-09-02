import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { LANGUAGES, type Language } from "@/lib/i18n";
import { ArrowLeft, Globe2, LoaderCircle, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

export default function AdminLanguageSettings() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const [countryCode, setCountryCode] = useState("");
  const [language, setLanguage] = useState<Language>("en");
  const utils = trpc.useUtils();
  const rules = trpc.languageRules.adminList.useQuery(undefined, { enabled: user?.role === "admin" });
  const saveRule = trpc.languageRules.save.useMutation({
    onSuccess: async () => { await utils.languageRules.adminList.invalidate(); setCountryCode(""); toast.success("国別の初期言語を保存しました。"); },
    onError: () => toast.error("保存できませんでした。管理者としてログインしているか確認してください。"),
  });
  const removeRule = trpc.languageRules.remove.useMutation({
    onSuccess: async () => { await utils.languageRules.adminList.invalidate(); toast.success("国別の上書き設定を削除しました。"); },
    onError: () => toast.error("削除できませんでした。"),
  });

  if (loading) return <main className="admin-stage"><div className="admin-sheet loading"><LoaderCircle className="animate-spin" /> 読み込んでいます…</div></main>;
  if (!user) return <main className="admin-stage"><section className="admin-sheet access-sheet"><p className="section-kicker">LANGUAGE OPERATIONS</p><h1>言語設定の管理</h1><p>国別の初期言語を変更するには、運用者アカウントでログインしてください。</p><Button onClick={() => startLogin()}><Globe2 />ログインする</Button><Button variant="ghost" onClick={() => navigate("/")}><ArrowLeft />ゲームへ戻る</Button></section></main>;
  if (user.role !== "admin") return <main className="admin-stage"><section className="admin-sheet access-sheet"><p className="section-kicker">ACCESS RESTRICTED</p><h1>管理者専用の画面です</h1><p>この画面は、サイト運用者だけが国別の初期言語を変更できる設定画面です。</p><Button variant="ghost" onClick={() => navigate("/")}><ArrowLeft />ゲームへ戻る</Button></section></main>;

  return <main className="admin-stage"><section className="admin-sheet"><div className="admin-heading"><div><p className="section-kicker">LANGUAGE OPERATIONS</p><h1>国別の初期言語</h1><p>ここで設定した国は、URL指定や利用者自身の保存済み選択がない初回アクセス時に優先されます。</p></div><Link href="/" className="admin-back"><ArrowLeft size={16} />ゲームへ戻る</Link></div><section className="rule-form" aria-label="国別言語ルールを追加または更新"><label>国コード<Input value={countryCode} maxLength={2} placeholder="例：JP" onChange={(event) => setCountryCode(event.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} /></label><label>初期言語<select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>{LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><Button onClick={() => saveRule.mutate({ countryCode, language })} disabled={countryCode.length !== 2 || saveRule.isPending}>{saveRule.isPending ? <LoaderCircle className="animate-spin" /> : <Save />}{countryCode ? "保存する" : "国コードを入力"}</Button></section><div className="rule-notes"><strong>設定の優先順位</strong><span>URL → 保存済みの手動選択 → この画面の国別設定 → 国コード → ブラウザ言語 → タイムゾーン → 日本語</span></div><section className="rule-list"><div className="rule-list-head"><span>国</span><span>表示言語</span><span>最終更新</span><span /></div>{rules.isLoading ? <p className="admin-empty"><LoaderCircle className="animate-spin" />設定を読み込んでいます…</p> : rules.data?.length ? rules.data.map((rule) => <div className="rule-row" key={rule.countryCode}><strong>{rule.countryCode}</strong><span>{LANGUAGES.find((item) => item.code === rule.language)?.label ?? rule.language}</span><small>{new Date(rule.updatedAt).toLocaleString()}</small><Button variant="ghost" aria-label={`${rule.countryCode}の設定を削除`} onClick={() => removeRule.mutate({ countryCode: rule.countryCode })} disabled={removeRule.isPending}><Trash2 size={16} />削除</Button></div>) : <p className="admin-empty">個別設定はまだありません。標準の国別対応表が使われます。</p>}</section></section></main>;
}
