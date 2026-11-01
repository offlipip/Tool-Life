import React, { useState } from 'react';
import {
  ChevronDown, Rocket, Wrench, Camera, Factory, RotateCcw, SlidersHorizontal, StickyNote, Palette, Download,
  Lightbulb, LifeBuoy, Copy, Layers,
} from 'lucide-react';
import { C, SANS, MONO } from './theme.js';
import { TopBar, Card } from './ui.jsx';
import { useApp } from './actions.js';
import { CRITICAL_MAX, WARNING_MAX } from './logic.js';

/* Tutorial do app, em seções que abrem e fecham. O texto descreve o que
   o app faz HOJE — ao mudar uma função, atualize a seção dela aqui. */

const P = ({ children }) => <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: C.text }}>{children}</p>;
const Steps = ({ items }) => (
  <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
    {items.map((it, i) => (
      <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ width: 28, height: 28, borderRadius: 14, background: C.navy, color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
        <span style={{ fontSize: 16, lineHeight: 1.5, paddingTop: 2 }}>{it}</span>
      </li>
    ))}
  </ol>
);
const Bullets = ({ items, plain }) => (
  <ul style={{ margin: 0, paddingLeft: plain ? 0 : 20, listStyle: plain ? 'none' : undefined, display: 'flex', flexDirection: 'column', gap: 7 }}>
    {items.map((it, i) => <li key={i} style={{ fontSize: 16, lineHeight: 1.5 }}>{it}</li>)}
  </ul>
);
const Tip = ({ children }) => (
  <div style={{ background: C.navyTint, borderRadius: 12, padding: '11px 13px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
    <Lightbulb size={19} color={C.navy} style={{ flexShrink: 0, marginTop: 2 }} />
    <span style={{ fontSize: 15, lineHeight: 1.5 }}>{children}</span>
  </div>
);
const H = ({ children }) => <div style={{ fontSize: 16.5, fontWeight: 700, color: C.navy, marginTop: 4 }}>{children}</div>;
const K = ({ children }) => <b style={{ fontWeight: 700 }}>{children}</b>;
const M = ({ children }) => <span style={{ fontFamily: MONO, fontWeight: 600 }}>{children}</span>;
const Dot = ({ color }) => <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 6, background: color, marginRight: 6, verticalAlign: '-1px' }} />;

const SECTIONS = [
  {
    id: 'inicio', icon: <Rocket size={22} />, title: 'Primeiros passos', body: (
      <>
        <P>O Toolpy organiza tudo como na fábrica: <K>Célula → Máquina → Operação → Ferramenta</K>. Comece de cima pra baixo:</P>
        <Steps items={[
          <>Na aba <K>Células</K>, toque em <K>Nova célula</K> (ex: “Célula 3”) e escolha o bloco que roda nela (4cc ou 6cc).</>,
          <>Dentro da célula, toque em <K>Cadastrar máquina</K> (ex: <M>6262</M>).</>,
          <>Na máquina, toque em <K>Cadastrar operação</K> (ex: <M>OP 800</M>) e escolha em qual <K>pallet</K> ela roda.</>,
          <>Cadastre as ferramentas da operação — dá pra ler todas de uma vez por foto (veja “Cadastrar ferramentas”).</>,
          <>Leia a foto da tela de <K>vida útil (#800–849)</K> pra preencher o limite de cada ferramenta.</>,
        ]} />
        <Tip>Tem outra máquina igual? Use <K>Copiar de outra máquina</K> e economize o cadastro inteiro.</Tip>
      </>
    ),
  },
  {
    id: 'telas', icon: <Layers size={22} />, title: 'As telas do app', body: (
      <>
        <Bullets items={[
          <><K>Início</K>: as ferramentas que trocam primeiro, de todas as células, e um resumo de cada célula.</>,
          <><K>Células</K>: a lista das suas células. No lápis do topo dá pra arrastar e mudar a ordem.</>,
          <><K>Câmera (botão do meio)</K>: ler qualquer foto do painel, de qualquer máquina.</>,
          <><K>Notas</K>: suas anotações, separadas por célula.</>,
          <><K>Ajustes</K>: backup, esta ajuda e o “Sobre”.</>,
        ]} />
        <H>Dentro de uma célula</H>
        <Bullets items={[
          <>As <K>máquinas</K> ficam em botões no topo — toque pra trocar.</>,
          <><K>Notas</K> (ícone de papel): anotações só dessa célula.</>,
          <><K>Engrenagem (Ajustes da célula)</K>: nome, bloco 4cc/6cc, adicionar máquina, excluir célula.</>,
          <><K>Lápis</K>: edita a máquina aberta — nome, operações, ferramentas, copiar e calibrar. Toque no ✓ pra terminar.</>,
        ]} />
        <Tip>O botão <K>voltar</K> do celular fecha o que estiver aberto e volta uma tela; no Início, ele só manda o app pro segundo plano.</Tip>
      </>
    ),
  },
  {
    id: 'cadastro', icon: <Wrench size={22} />, title: 'Cadastrar ferramentas', body: (
      <>
        <H>Várias de uma vez, por foto</H>
        <Steps items={[
          <>Toque na <K>câmera</K> → <K>Tela do programa</K> → escolha a operação.</>,
          <>Fotografe a tela do programa da máquina <i>ou</i> a tabela de ferramentas (colunas <M>N.</M> e <M>Cod. fer.</M>).</>,
          <>Confira a lista: dá pra <K>corrigir um código tocando nele</K> e desmarcar o que não quiser. Borda laranja = código que parece incompleto.</>,
          <>Toque em <K>Cadastrar</K>. Depois leia a vida útil (#800) pra completar.</>,
        ]} />
        <H>Uma ferramenta só</H>
        <P>No lápis da máquina, toque em <K>+ Ferramenta</K> na operação. Você pode ler o slot e o código de uma foto do programa, ou digitar. Se ler antes a foto da vida útil (#800), ela preenche sozinha ao escolher o slot.</P>
        <H>Ferramenta de rotina</H>
        <P>Marque “ferramenta de rotina” pra itens sem vida útil (ex: limpeza). Ela só conta, sem barra de vida.</P>
        <H><Copy size={16} style={{ verticalAlign: '-2px' }} /> Copiar de outra máquina</H>
        <P>No lápis da máquina → <K>Copiar de outra máquina</K>. Escolha a origem e marque o que copiar: <K>ferramentas que faltam</K> (vêm com vida atual zerada) e/ou <K>desgaste calibrado</K>. O app mostra tudo antes de aplicar.</P>
      </>
    ),
  },
  {
    id: 'foto', icon: <Camera size={22} />, title: 'Ler fotos do painel', body: (
      <>
        <P>Pelo botão <K>Ler foto</K> da máquina ou pela câmera do meio, escolha o que vai ler:</P>
        <Bullets items={[
          <><K>Vida atual (#900–949)</K> — o do dia a dia: atualiza quanto cada ferramenta já gastou.</>,
          <><K>Vida útil (#800–849)</K> — o limite de cada uma. Quase nunca muda.</>,
          <><K>Tela do programa</K> — cadastra ferramentas novas.</>,
          <><K>Digitar na mão</K> — sem foto, quando a câmera não ajuda.</>,
        ]} />
        <Steps items={[
          <>Tire a foto (ou escolha da galeria).</>,
          <><K>Recorte</K>: arraste os dois cantos pra deixar só os números, fora do menu e do reflexo.</>,
          <><K>Confira</K>: bolinha verde = leitura boa, <K>laranja = duvidosa</K>. Corrija o que precisar. Campo em branco mantém o valor de antes.</>,
          <>Toque em <K>Salvar leitura</K>.</>,
        ]} />
        <Tip>No app instalado (apk) a leitura usa o <K>ML Kit do Google</K>, bem mais preciso. Funciona sem internet.</Tip>
      </>
    ),
  },
  {
    id: 'producao', icon: <Factory size={22} />, title: 'Lançar produção do turno', body: (
      <>
        <P>Entre uma foto e outra, você pode lançar as peças feitas. O app soma <K>desgaste × peças</K> em todas as ferramentas daquele pallet.</P>
        <Steps items={[
          <>Na máquina, toque em <K>Produção</K>.</>,
          <>Digite as peças que o turno fez no pallet certo e toque em <K>Lançar</K>.</>,
          <>Errou? Toque em <K>Desfazer</K> — volta só o último lançamento daquele pallet.</>,
        ]} />
        <Tip>O botão Produção só aparece se as operações tiverem pallet definido (lápis → Editar operação).</Tip>
      </>
    ),
  },
  {
    id: 'troca', icon: <RotateCcw size={22} />, title: 'Trocou a ferramenta? Zere', body: (
      <>
        <P>Quando trocar uma ferramenta, zere a vida atual dela. Dois jeitos:</P>
        <Bullets items={[
          <>Toque no <K>↺</K> à direita da linha e confirme no <K>✓</K> ali mesmo.</>,
          <>Ou toque na ferramenta → <K>Troquei a ferramenta</K>.</>,
        ]} />
        <P>Se a ferramenta tiver uma anotação com lembrete (ex: “levar pro 3D”), ele aparece na hora de confirmar.</P>
        <H>Ficha da ferramenta</H>
        <P>Tocando numa ferramenta você vê as peças até trocar, vida atual, vida útil, desgaste por peça e há quanto tempo foi atualizada. Lá também tem <K>Ajustar vida</K> (corrigir só o número) e <K>Editar dados</K> (slot, código, vida útil, desgaste, excluir).</P>
      </>
    ),
  },
  {
    id: 'cores', icon: <Palette size={22} />, title: 'Cores e números', body: (
      <>
        <P>O número grande de cada linha é quantas <K>peças</K> faltam pra ferramenta chegar no limite. Embaixo da barra: <M>vida atual / vida útil</M>.</P>
        <Bullets plain items={[
          <><Dot color={C.ok} /><K>Verde</K>: mais de {WARNING_MAX} peças — tranquilo.</>,
          <><Dot color={C.warn} /><K>Laranja</K>: {CRITICAL_MAX + 1} a {WARNING_MAX} peças — se prepare pra trocar.</>,
          <><Dot color={C.crit} /><K>Vermelho</K>: {CRITICAL_MAX} peças ou menos — troca já.</>,
        ]} />
        <P>A conta é <M>(vida útil − vida atual) ÷ desgaste por peça</M>. Por isso vale calibrar o desgaste.</P>
      </>
    ),
  },
  {
    id: 'calib', icon: <SlidersHorizontal size={22} />, title: 'Calibrar o desgaste', body: (
      <>
        <P>Cada ferramenta começa com um desgaste padrão (1 no 4cc, 1,5 no 6cc). Calibrando, o app mede o desgaste real de cada uma.</P>
        <Steps items={[
          <>Lápis da máquina → <K>Calibrar desgaste</K>.</>,
          <>Leia a <K>vida atual</K> (foto ou digitando) — essa leitura é o <K>início</K>.</>,
          <>Deixe a máquina rodar normalmente. Quanto mais peças, mais precisa fica a medida.</>,
          <>Toque em <K>Finalizar calibração</K> e leia a vida atual de novo — é o <K>fim</K>.</>,
          <>Informe quantas peças rodaram nesse intervalo e toque em <K>Salvar calibração</K>.</>,
        ]} />
        <Tip>Ferramenta trocada no meio da calibração dá valor zero ou negativo e fica de fora automaticamente. Cada ferramenta guarda um desgaste pra cada bloco (4cc e 6cc).</Tip>
      </>
    ),
  },
  {
    id: 'notas', icon: <StickyNote size={22} />, title: 'Anotações e lembretes', body: (
      <>
        <P>Guarde o que é bom lembrar, separado por célula — por exemplo: “se trocar a T2 ou T3, levar a peça pro 3D”.</P>
        <Steps items={[
          <>Aba <K>Notas</K> → <K>Nova anotação</K> (ou o ícone de notas dentro da célula).</>,
          <>Escreva, e se quiser <K>ligue a ferramentas</K> (toque nos T).</>,
          <>Marque <K>Avisar quando eu registrar a troca</K> pra virar lembrete.</>,
        ]} />
        <P>Nota ligada a um T aparece na ficha dele, e o ícone de papel aparece na linha da ferramenta.</P>
      </>
    ),
  },
  {
    id: 'backup', icon: <Download size={22} />, title: 'Backup e trocar de celular', body: (
      <>
        <P>Os dados ficam <K>só neste aparelho</K>. <K>Desinstalar o app ou limpar os dados apaga tudo</K> — faça backup de vez em quando.</P>
        <Steps items={[
          <>Ajustes → <K>Exportar backup</K>: no app instalado abre o menu de compartilhar — mande pro seu WhatsApp, Drive ou e-mail.</>,
          <>Ou use <K>Copiar backup como texto</K> e cole numa conversa com você mesmo.</>,
          <>Pra restaurar: Ajustes → <K>Importar arquivo de backup</K> ou <K>Importar colando o texto</K>.</>,
        ]} />
        <Tip>Importar <K>substitui tudo</K> que está no app pelo backup. O site no navegador e o app instalado guardam dados separados — use o backup pra passar de um pro outro.</Tip>
      </>
    ),
  },
  {
    id: 'dicas', icon: <Lightbulb size={22} />, title: 'Dicas pra foto sair boa', body: (
      <Bullets items={[
        <>Segure o celular <K>reto</K>, de frente pra tela, sem inclinar.</>,
        <>Chegue perto: a área dos números deve ocupar quase a foto toda.</>,
        <>Fuja do <K>reflexo</K> da luz e da tela — mude um pouco o ângulo.</>,
        <>Espere focar antes de tirar; sem tremer.</>,
        <>No recorte, deixe só os números — tirar o menu e as bordas ajuda muito.</>,
      ]} />
    ),
  },
  {
    id: 'problemas', icon: <LifeBuoy size={22} />, title: 'Problemas comuns', body: (
      <>
        <H>O app não mostra a novidade</H>
        <P>Configurações do celular → Apps → Toolpy → <K>Forçar parada</K> e abra de novo. Só fechar pela lista de recentes não basta.</P>
        <H>A leitura veio errada</H>
        <P>Corrija o valor na tela de conferência antes de salvar, ou repita a foto com outro ângulo. Pra um número só, use <K>Ajustar vida</K> na ficha da ferramenta.</P>
        <H>Instalar um apk novo</H>
        <P>Baixe pelo link de sempre e instale <K>por cima</K> — não desinstale (desinstalar apaga os dados). Se o Android avisar “fonte desconhecida”, é normal pra app fora da Play Store.</P>
        <H>O botão Produção não aparece</H>
        <P>Defina o pallet das operações: lápis da máquina → <K>Editar operação</K>.</P>
      </>
    ),
  },
];

export function HelpScreen() {
  const { nav } = useApp();
  const [open, setOpen] = useState('inicio');
  return (
    <>
      <TopBar title="Ajuda" subtitle="Como usar o Toolpy" onBack={nav.close} />
      <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SECTIONS.map((s) => {
          const isOpen = open === s.id;
          return (
            <Card key={s.id} style={isOpen ? { border: `1.5px solid ${C.navy}` } : undefined}>
              <button type="button" onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen}
                style={{ width: '100%', minHeight: 64, display: 'flex', alignItems: 'center', gap: 13, padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: SANS, color: C.text, textAlign: 'left' }}>
                <span style={{ width: 42, height: 42, borderRadius: 11, background: isOpen ? C.navy : C.navyTint, color: isOpen ? '#fff' : C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.icon}</span>
                <span style={{ flex: 1, fontSize: 17, fontWeight: 600 }}>{s.title}</span>
                <ChevronDown size={22} color={C.muted} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} />
              </button>
              {isOpen && (
                <div style={{ padding: '2px 16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>{s.body}</div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
