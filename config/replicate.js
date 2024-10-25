// Importação do cliente oficial do Replicate
import Replicate from 'replicate';

// Importação do dotenv para carregar variáveis de ambiente
import dotenv from 'dotenv';

// Carrega as variáveis de ambiente do arquivo .env
dotenv.config();

// Verifica se a chave de API do Replicate existe nas variáveis de ambiente
// Se não existir, lança um erro e interrompe a aplicação
if (!process.env.REPLICATE_API_TOKEN) {
  throw new Error('REPLICATE_API_TOKEN não encontrado nas variáveis de ambiente');
}

// Cria uma nova instância do cliente Replicate
// Configura a autenticação usando a chave de API das variáveis de ambiente
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Exporta a instância configurada do Replicate para uso em outros arquivos
export default replicate;