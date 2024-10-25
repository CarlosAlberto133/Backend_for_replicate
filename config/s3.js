// Importação das dependências necessárias
import { S3Client } from "@aws-sdk/client-s3";        // Cliente S3 da AWS
import { Upload } from "@aws-sdk/lib-storage";        // Classe para gerenciar uploads
import dotenv from 'dotenv';                          // Para variáveis de ambiente
import fs from 'fs';                                  // Para operações com arquivos

// Carrega as variáveis de ambiente do arquivo .env
dotenv.config();

// Inicializa o cliente S3 com as credenciais da AWS
const s3Client = new S3Client({
  region: process.env.AWS_REGION,                     // Região do bucket S3
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,       // Chave de acesso AWS
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY // Chave secreta AWS
  }
});

/**
 * Função especializada para upload de arquivos grandes para o S3
 * @param {Buffer} buffer - Buffer contendo os dados do arquivo
 * @param {string} fileName - Nome do arquivo no S3
 * @returns {Promise<string>} URL pública do arquivo no S3
 */
export const uploadLargeFileToS3 = async (buffer, fileName) => {
  try {
    console.log('Iniciando upload de arquivo grande para S3:', fileName);

    // Configura o upload com parâmetros otimizados para arquivos grandes
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: process.env.AWS_BUCKET_NAME,          // Nome do bucket
        Key: fileName,                                // Nome/caminho do arquivo no S3
        Body: buffer,                                 // Dados do arquivo
        ContentType: 'application/octet-stream'       // Tipo do conteúdo
      },
      queueSize: 4,                                  // Número de uploads paralelos
      partSize: 5 * 1024 * 1024                      // Tamanho de cada parte (5MB)
    });

    // Monitora o progresso do upload
    upload.on("httpUploadProgress", (progress) => {
      const percentage = ((progress.loaded / progress.total) * 100).toFixed(2);
      console.log(`Progresso do upload: ${percentage}%`);
    });

    // Aguarda a conclusão do upload
    await upload.done();

    // Gera e retorna a URL pública do arquivo
    const publicUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    console.log('Upload concluído. URL:', publicUrl);

    return publicUrl;
  } catch (error) {
    console.error('Erro no upload:', error);
    throw error;
  }
};

/**
 * Função para uploads normais de arquivo para o S3
 * @param {string} filePath - Caminho local do arquivo
 * @param {string} fileName - Nome do arquivo no S3
 * @returns {Promise<string>} URL pública do arquivo no S3
 */
export const uploadToS3 = async (filePath, fileName) => {
  try {
    console.log('Iniciando upload para S3:', { filePath, fileName });
    
    // Verifica se o arquivo existe localmente
    if (!fs.existsSync(filePath)) {
      throw new Error(`Arquivo não encontrado: ${filePath}`);
    }

    // Cria um stream de leitura do arquivo
    const fileStream = fs.createReadStream(filePath);
    // Obtém o tamanho do arquivo
    const fileSize = fs.statSync(filePath).size;

    // Configura o upload
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: fileName,
        Body: fileStream,
        // Define o tipo de conteúdo baseado na extensão do arquivo
        ContentType: fileName.endsWith('.zip') ? 'application/zip' : 'application/octet-stream'
      }
    });

    // Monitora o progresso do upload
    upload.on("httpUploadProgress", (progress) => {
      const percentage = ((progress.loaded / progress.total) * 100).toFixed(2);
      console.log(`Progresso do upload: ${percentage}%`);
    });

    // Aguarda a conclusão do upload
    await upload.done();

    // Gera e retorna a URL pública do arquivo
    const publicUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    console.log('Upload concluído. URL:', publicUrl);

    return publicUrl;
  } catch (error) {
    console.error('Erro no upload:', error);
    throw error;
  }
};

// Exporta o cliente S3 para uso em outros módulos
export default s3Client;