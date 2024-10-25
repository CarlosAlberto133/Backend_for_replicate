// Importação das dependências necessárias
import * as tar from 'tar';              // Para manipulação de arquivos .tar
import { createWriteStream } from 'fs';  // Para criar streams de escrita de arquivo
import { pipeline } from 'stream/promises'; // Para trabalhar com streams de forma assíncrona
import path from 'path';                 // Para manipulação de caminhos de arquivo
import fs from 'fs';                     // Para operações do sistema de arquivos
import { fileURLToPath } from 'url';     // Para converter URLs de arquivo em caminhos
import { uploadLargeFileToS3 } from './s3.js'; // Função para upload no S3

// Converte a URL do arquivo atual em um caminho do sistema
const __filename = fileURLToPath(import.meta.url);
// Obtém o diretório do arquivo atual
const __dirname = path.dirname(__filename);

/**
 * Processa arquivos de pesos de modelo, realizando download, extração e upload para S3
 * @param {string} weightsUrl - URL de origem dos pesos do modelo
 * @param {string} modelId - Identificador único do modelo
 * @returns {Promise<string>} URL do arquivo no S3
 */
export const processWeights = async (weightsUrl, modelId) => {
  try {
    console.log('Iniciando download dos pesos:', weightsUrl);
    
    // Define os diretórios de trabalho
    const tempDir = path.join(__dirname, '..', 'temp');        // Diretório temporário
    const extractDir = path.join(tempDir, modelId);            // Diretório de extração específico do modelo
    
    // Cria os diretórios se não existirem
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    if (!fs.existsSync(extractDir)) {
      fs.mkdirSync(extractDir, { recursive: true });
    }

    // Define o caminho do arquivo .tar temporário
    const tarPath = path.join(tempDir, `${modelId}.tar`);
    // Cria um stream de escrita para o arquivo .tar
    const fileStream = createWriteStream(tarPath);
    
    // Realiza o download do arquivo
    console.log('Baixando arquivo tar...');
    const response = await fetch(weightsUrl);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    // Usa pipeline para gerenciar o stream de download
    await pipeline(response.body, fileStream);
    
    console.log('Download concluído, extraindo arquivo...');

    // Extrai o arquivo .tar no diretório específico do modelo
    await tar.extract({
      file: tarPath,
      cwd: extractDir
    });

    // Função recursiva para encontrar arquivo .safetensors dentro do diretório extraído
    console.log('Procurando arquivo safetensors...');
    const findSafetensors = (dir) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        // Se for um diretório, busca recursivamente
        if (stat.isDirectory()) {
          const found = findSafetensors(fullPath);
          if (found) return found;
        // Se for um arquivo .safetensors, retorna seu caminho
        } else if (file.endsWith('.safetensors')) {
          return fullPath;
        }
      }
      return null;
    };

    // Busca o arquivo .safetensors
    const loraPath = findSafetensors(extractDir);
    if (!loraPath) {
      throw new Error('Arquivo .safetensors não encontrado');
    }

    // Realiza o upload do arquivo para o S3
    console.log('Modelo encontrado, iniciando upload para S3...');
    const fileBuffer = fs.readFileSync(loraPath);
    
    // Upload para S3 e retorna a URL do arquivo
    const s3Url = await uploadLargeFileToS3(
      fileBuffer,
      `models/${modelId}/lora.safetensors`
    );

    return s3Url;
  } catch (error) {
    console.error('Erro ao processar arquivo de pesos:', error);
    throw error;
  }
};