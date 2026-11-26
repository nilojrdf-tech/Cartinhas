# Fase 0 — publicar o Cartinhas na VPS

Roteiro para o dia em que houver acesso ao EasyPanel e ao DNS. A rede do trabalho alcança
o site, mas bloqueia o painel e o SSH: **faça isto de uma rede que alcance a administração**.

Nada aqui mexe no ROTA. Em cada passo há o que conferir antes de seguir.

## Antes de começar, ter em mãos

| O que | Por quê |
| --- | --- |
| Acesso ao EasyPanel | Criar o projeto, o app e os volumes |
| Acesso ao DNS de `rochajunior.com.br` | Apontar o subdomínio novo |
| O remetente dos e-mails (servidor, porta, usuário e senha) | Ativação e recuperação de senha |
| O e-mail de recuperação do Nilo | Habilitar a conta inicial |
| Decisão sobre a cópia externa de backup | Enquanto não houver, o risco de perda total fica em aberto |

As senhas e chaves ficam **só no painel**, nas variáveis do serviço. Nunca em arquivo do
repositório.

## 1. Medir a VPS antes de criar qualquer coisa

No painel (ou no host), anotar: memória livre, disco livre e se o ROTA está respondendo.

```
free -m
df -h
curl -I https://rota.rochajunior.com.br
```

A VPS tem cerca de 1,7 GB de RAM e 49 GB de disco, compartilhados com o ROTA. O Cartinhas
é Node puro, sem build de dependências: a construção da imagem não compila nada, o que
importa em 1 vCPU. **Se a memória livre estiver apertada, pare aqui e fale com o Nilo.**

## 2. Criar o projeto e o app

No EasyPanel:

- Projeto `cartinhas`, serviço `cartinhas` do tipo **App**.
- **Source:** o repositório do Cartinhas, branch de implantação, **Build path `publico/app`**
  (é onde está o `Dockerfile`).
- **Build:** Dockerfile.
- Uma instância só, para começar.

### Volumes (Mounts)

| Montar em | Para quê |
| --- | --- |
| `/dados` | O SQLite e seus arquivos auxiliares (`-wal`, `-shm`) e as mensagens em modo arquivo |
| `/backups` | As cópias diárias |

Os dois precisam de permissão de escrita para o usuário `node` (o Dockerfile já faz o
`chown`, mas o volume montado por cima pode vir com outro dono: conferir).

### Variáveis (Environment)

```
CARTINHAS_PORTA=8080
CARTINHAS_DADOS=/dados
CARTINHAS_ENDERECO=https://cartinhas.rochajunior.com.br
TZ=America/Sao_Paulo
CARTINHAS_EMAIL_MODO=smtp
CARTINHAS_SMTP_HOST=<servidor de e-mail>
CARTINHAS_SMTP_PORTA=587
CARTINHAS_SMTP_USUARIO=<usuário>
CARTINHAS_SMTP_SENHA=<senha>
CARTINHAS_REMETENTE=cartinhas@<domínio>
CARTINHAS_ADMIN_MATRICULA=<matrícula do Nilo>
CARTINHAS_ADMIN_EMAIL=<e-mail de recuperação do Nilo>
```

`CARTINHAS_ENDERECO` precisa começar com `https://`: é por ele que o servidor decide marcar
o cookie de sessão como `Secure`, e é ele que aparece nos links dos e-mails.

As duas últimas criam a conta de Nilo como administrador **na primeira subida**, sem senha.
A senha ele mesmo define pelo "Esqueci minha senha" — assim nenhuma senha inicial existe em
lugar nenhum. Depois que a conta existir, essas duas variáveis podem sair.

**Conferir:** o app sobe, o log mostra `Cartinhas no ar na porta 8080`, e o painel mostra o
consumo de memória. Anotar quanto ficou. Conferir de novo se o ROTA responde.

## 3. Domínio e HTTPS

- Apontar o registro A de `cartinhas.rochajunior.com.br` para a mesma VPS (conferir antes se
  o subdomínio está livre).
- No painel, em **Domains**, encaminhar esse domínio para a porta **8080** do contêiner, com
  certificado pelo EasyPanel (Let's Encrypt). O Traefik já atende 80 e 443.

**Conferir:**

- `https://cartinhas.rochajunior.com.br/api/saude` responde `{"ok":true,...}`.
- `https://cartinhas.rochajunior.com.br/robots.txt` diz `Disallow: /`.
- A página abre no celular e o navegador oferece **instalar / adicionar à tela inicial**
  (só aparece com HTTPS válido).
- O ROTA continua respondendo.

## 4. Testar o e-mail

Entrar como administrador e usar o teste de envio:

```
curl -s -X POST https://cartinhas.rochajunior.com.br/api/teste-email \
  -H 'x-cartinhas: 1' -H 'content-type: application/json' \
  -b 'cs=<cookie da sessão>' --data '{"para":"<seu e-mail>"}'
```

Ou, mais simples: na tela de entrada, pedir "Esqueci minha senha" e ver se o e-mail chega.

**Conferir:** a mensagem chega, não cai em spam, e o link abre a tela de senha nova.
Se não chegar, o log do app diz o que o servidor de e-mail respondeu (sem mostrar a senha).

## 5. Backup

Agendar `node backup.cjs` uma vez por dia (tarefa agendada do painel ou cron no host, no
contêiner do Cartinhas):

```
node /app/backup.cjs
```

O script usa `VACUUM INTO`, que escreve uma cópia consistente mesmo com o app em uso,
confere a cópia recém-criada e só então apaga as que passaram de 30 dias. Se a cópia de hoje
não passar na conferência, **nenhuma antiga é apagada**.

**Conferir:** no dia seguinte, `ls /backups` mostra o arquivo do dia, e

```
node /app/backup.cjs --conferir /backups/cartinhas-AAAA-MM-DD.sqlite
```

diz `íntegra` com a contagem de contas e dias.

### Restaurar

Nunca por cima do banco em uso.

1. Parar o serviço no painel.
2. Copiar a cópia escolhida para outro caminho, por exemplo `/dados/restaurado.sqlite`.
3. Conferir: `node /app/backup.cjs --conferir /dados/restaurado.sqlite`.
4. Subir o serviço apontando `CARTINHAS_BANCO`/`CARTINHAS_DADOS` para o restaurado, entrar
   e conferir as contas e os saldos de um mês conhecido.
5. Só depois de conferir, trocar o banco em uso. **Registrar de qual cópia veio.**

## 6. Migrar os meses do Nilo (fase 3)

Com a conta já ativa, de dentro do contêiner (ou com o banco copiado para o computador):

```
node migrar.cjs --arquivo cartinhas-dados.json --matricula <matrícula> --banco /dados/cartinhas.sqlite
```

Sem `--confirmar` ele só mostra o que faria. Com `--confirmar`, grava e **confere dia a dia
e o saldo de cada mês contra o arquivo**, terminando com erro se algo não bater.

O `cartinhas-dados.json` não entra no repositório nem na imagem: é levado à mão e apagado
depois.

## 7. Se precisar voltar atrás

Desativar **somente** o serviço e o domínio do Cartinhas no EasyPanel. **Preservar os
volumes** `/dados` e `/backups`. Registrar a causa antes de tentar de novo. O ROTA não é
tocado em nenhum passo deste roteiro.

## Encerrar a fase

A fase 0 termina quando, no mesmo dia, estiver registrado que:

- [ ] o subdomínio abre por HTTPS no celular e dá para instalar na tela inicial;
- [ ] um e-mail de teste chegou pelo remetente configurado;
- [ ] o ROTA continua respondendo, e o consumo de memória da VPS está anotado antes e depois;
- [ ] a primeira cópia de backup foi gerada e conferida;
- [ ] a conta do Nilo está ativa, com senha definida por ele.
