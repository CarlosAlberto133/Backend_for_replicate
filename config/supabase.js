// Importações necessárias
import { createClient } from '@supabase/supabase-js';  // Cliente oficial do Supabase
import * as fs from 'fs';                              // Módulo de sistema de arquivos
import path from 'path';                               // Manipulação de caminhos
import { fileURLToPath } from 'url';                   // Conversão de URLs para caminhos
import dotenv from 'dotenv';                           // Carregamento de variáveis de ambiente

// Configuração do __dirname para ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega as variáveis de ambiente do arquivo .env
dotenv.config();

// Obtém as credenciais do Supabase das variáveis de ambiente
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

// Validação das credenciais
if (!supabaseUrl || !supabaseKey) {
  throw new Error('Credenciais do Supabase não encontradas nas variáveis de ambiente');
}

// Cria o cliente Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Função para fazer upload de arquivos para o Supabase Storage
export const uploadToSupabase = async (filePath, fileName) => {
  try {
    console.log('Iniciando upload para Supabase:', { filePath, fileName });
    
    // Verifica se o arquivo existe no sistema de arquivos
    if (!fs.existsSync(filePath)) {
      throw new Error(`Arquivo não encontrado: ${filePath}`);
    }

    // Lê o arquivo ZIP para um buffer
    const fileBuffer = fs.readFileSync(filePath);
    console.log('Arquivo ZIP lido, tamanho:', fileBuffer.length);
    
    // Realiza o upload do arquivo para o bucket 'training-files'
    console.log('Iniciando upload para bucket training-files...');
    const { data, error } = await supabase
      .storage
      .from('training-files')        // Nome do bucket
      .upload(`zips/${fileName}`,    // Caminho do arquivo no bucket
              fileBuffer,            // Conteúdo do arquivo
              {
                contentType: 'application/zip',  // Tipo do conteúdo
                upsert: true                     // Sobrescreve se já existir
              });

    // Verifica se houve erro no upload
    if (error) {
      console.error('Erro no upload para Supabase:', error);
      throw error;
    }

    console.log('Upload concluído, gerando URL pública...');

    // Gera uma URL pública para o arquivo
    const { data: publicUrl } = supabase
      .storage
      .from('training-files')
      .getPublicUrl(`zips/${fileName}`);

    console.log('URL pública gerada:', publicUrl.publicUrl);
    return publicUrl.publicUrl;

  } catch (error) {
    console.error('Erro no processo de upload:', error);
    throw error;
  }
};

// Exporta o cliente Supabase configurado
export default supabase;