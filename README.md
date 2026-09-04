# Vida de Ferramentas

App para acompanhar a vida útil das ferramentas por operação, com leitura
automática da tela "VARIAVEL MACRO" do painel Mazak a partir de uma foto.
Roda inteiro no navegador — sem servidor, sem chave de API, sem custo.

## Colocando no ar (sem precisar instalar nada no computador)

Isso usa só o site do GitHub, pelo navegador. Uma vez configurado, toda
atualização é automática.

**1. Crie uma conta em [github.com](https://github.com)** (se ainda não tiver).

**2. Crie um repositório novo:**
   - Clique em "New repository"
   - Nome: o que quiser, ex. `vida-ferramentas`
   - Deixe como **Public** (necessário pro GitHub Pages grátis funcionar
     em conta pessoal gratuita)
   - Não marque nenhuma opção de inicializar com README — deixe vazio

**3. Suba os arquivos deste projeto:**
   - Na página do repositório recém-criado, clique em "uploading an
     existing file"
   - Arraste a pasta inteira do projeto (todos os arquivos e pastas,
     incluindo a pasta `.github`) pra área de upload
   - Role até embaixo e clique em "Commit changes"

**4. Ative o GitHub Pages:**
   - No repositório, vá em **Settings → Pages**
   - Em "Build and deployment" → "Source", escolha **GitHub Actions**
     (não escolha "Deploy from a branch")

**5. Aguarde a publicação:**
   - Vá na aba **Actions** do repositório — vai aparecer um fluxo
     "Publicar no GitHub Pages" rodando
   - Quando ficar verde (uns 1-2 minutos), o app está no ar em:
     `https://SEU-USUARIO.github.io/NOME-DO-REPO/`

**6. Instale no celular:**
   - Abra esse link no Chrome do Android
   - Toque no menu (⋮) → "Adicionar à tela inicial" / "Instalar app"

Da próxima vez que você editar qualquer arquivo pelo próprio site do
GitHub (ícone de lápis em cima do arquivo → editar → "Commit changes"),
a publicação atualiza sozinha.

## Antes de usar de verdade

Não tive como testar esse app rodando de verdade num navegador — só
revisei o código com cuidado e conferi que ele monta sem erro. Teste com
uma foto de cada vez e me avise se algo não se comportar como esperado
(principalmente a leitura por foto, que é a parte mais delicada) que eu
ajusto.

Na primeira leitura de foto, o navegador baixa o modelo de OCR (uns
10-15MB) — faça essa primeira leitura com Wi-Fi. Depois disso ele fica
guardado no aparelho e funciona offline.

## Limitações desta versão

- **Leitura por foto é local e mais simples** que um modelo de IA — tende
  a errar mais com reflexo de luz, foto torta ou tremida. Por isso a
  etapa de conferência antes de salvar existe: confira, corrija na mão o
  que precisar, ou repita a foto.
- **Dados ficam só naquele navegador/aparelho.** Não há sincronização
  entre celular e computador, nem backup na nuvem. Limpar os dados de
  navegação do Chrome apaga tudo — evite fazer isso, ou peça pra eu
  adicionar um botão de exportar/importar antes de contar com isso no
  dia a dia.
- **Sem histórico de leituras** — só guarda o valor mais recente de cada
  ferramenta, não o histórico de todas as leituras ao longo do tempo.
- Se você já tinha usado a versão anterior deste app (sem Célula/Máquina),
  seus dados antigos são migrados automaticamente pra uma célula chamada
  "Célula (dados antigos)" na primeira vez que abrir esta versão — é só
  renomear e organizar em máquinas depois.

## Estrutura do projeto

```
index.html          página principal, meta tags do PWA
public/manifest.json ícone, nome e cores do app instalado
public/sw.js         cache simples pra funcionar offline
public/icons/        ícones do app
src/main.jsx         ponto de entrada do React
src/App.jsx          toda a interface: Célula → Máquina → Operação → Ferramenta
src/ocr.js           leitura da foto (Tesseract.js) e casamento #NNN → valor
src/storage.js        salvar/carregar os dados no navegador
.github/workflows/    publica automaticamente a cada atualização
```

## Como os dados são organizados

```
Célula (ex: "Célula 5")
  └─ Máquina (ex: "6262", "6265")
       └─ Operação (ex: "OP 800", "OP 900")
            └─ Ferramenta (slot, código BMAN, vida útil, desgaste/peça, vida atual)
```

Cada foto é lida dentro de uma Operação específica — o app já sabe, pela
máquina e operação em que você está, quais ferramentas (slots #80N/#90N)
esperar naquela tela.

Ao cadastrar uma máquina nova numa célula que já tem outra parecida (ex:
6265 usa as mesmas ferramentas que a 6262), dá pra escolher "copiar
operações e ferramentas de" — isso copia slot, código BMAN, vida útil e
desgaste por peça, mas zera a vida atual, já que é um jogo de ferramentas
físico separado, com desgaste próprio.


## Rodando localmente (opcional, se você tiver Node.js instalado)

```
npm install
npm run dev
```
