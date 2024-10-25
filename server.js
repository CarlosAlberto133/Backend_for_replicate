// Importação dos módulos necessários
import express from 'express';
import cors from 'cors';
import replicate from './config/replicate.js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { uploadToS3 } from './config/s3.js';
import { processWeights } from './config/weights.js';

// Configuração do __dirname para ES modules (necessário pois ES modules não tem __dirname por padrão)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Criar diretório para armazenar uploads se não existir
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Carregar variáveis de ambiente do arquivo .env
dotenv.config();

// Inicializar aplicação Express
const app = express();
app.use(cors());                              // Habilitar CORS para todas as rotas
app.use(express.json());                      // Parser para requisições JSON

// Configuração do multer para gerenciar uploads de arquivos
const storage = multer.diskStorage({
  // Define onde os arquivos serão salvos
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  // Define o nome do arquivo usando UUID para evitar conflitos
  filename: function (req, file, cb) {
    cb(null, uuidv4() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Função auxiliar para criar arquivo ZIP com as imagens de treinamento
const createImagesZip = async (files) => {
  try {
    const zip = new AdmZip();
    const zipName = `training_${Date.now()}.zip`;
    const zipPath = path.join(uploadsDir, zipName);

    console.log('Criando ZIP com os arquivos:', files);
    
    // Adiciona cada arquivo ao ZIP
    files.forEach(file => {
      const filePath = path.join(uploadsDir, path.basename(file.filename));
      console.log('Adicionando arquivo ao ZIP:', filePath);
      if (fs.existsSync(filePath)) {
        zip.addLocalFile(filePath);
      } else {
        console.warn('Arquivo não encontrado:', filePath);
      }
    });

    await zip.writeZipPromise(zipPath);
    console.log('ZIP criado em:', zipPath);

    return { zipPath, zipName };
  } catch (error) {
    console.error('Erro ao criar ZIP:', error);
    throw error;
  }
};

// Rota para verificar o status do treinamento
app.get('/api/check-training-status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Verificando status do treinamento:', id);

    const training = await replicate.trainings.get(id);
    
    // Se o treinamento foi concluído e tem pesos não processados
    if (training.status === 'succeeded' && 
        training.output?.weights && 
        !training.processedWeights) {
      
      try {
        console.log('Processando arquivo de pesos...');
        const modelUrl = await processWeights(
          training.output.weights,
          training.id
        );

        return res.json({
          ...training,
          processedWeights: true,
          modelUrl
        });
      } catch (extractError) {
        console.error('Erro ao processar pesos:', extractError);
        return res.json({
          ...training,
          extractError: extractError.message
        });
      }
    }

    res.json(training);
  } catch (error) {
    console.error('Erro ao verificar status do treinamento:', error);
    res.status(500).json({ 
      error: 'Erro ao verificar status do treinamento',
      details: error.message 
    });
  }
});

// Rota para upload de imagens
app.post('/api/upload-images', upload.array('images'), async (req, res) => {
  try {
    const files = req.files;
    console.log('Arquivos recebidos:', files);

    // Validação do número mínimo de imagens
    if (!files || files.length < 5) {
      return res.status(400).json({
        error: 'Número insuficiente de imagens',
        details: 'São necessárias pelo menos 5 imagens'
      });
    }

    // Mapeia informações relevantes dos arquivos
    const uploadedFiles = files.map(file => ({
      filename: file.filename,
      path: file.path
    }));

    res.json({ files: uploadedFiles });
  } catch (error) {
    console.error('Erro no upload:', error);
    res.status(500).json({ error: 'Erro no upload das imagens' });
  }
});

// Rota para iniciar o treinamento
app.post('/api/start-training', async (req, res) => {
  try {
    const {
      steps,
      loraRank,
      optimizer,
      batchSize,
      resolution,
      autocaption,
      imageFiles,
      triggerWord,
      learningRate,
      wandbProject,
      wandbSaveInterval,
      captionDropoutRate,
      cacheLatentsToDisk,
      wandbSampleInterval
    } = req.body;

    console.log('Iniciando treinamento com arquivos:', imageFiles);

    if (!imageFiles || imageFiles.length < 5) {
      return res.status(400).json({
        error: 'Número insuficiente de imagens',
        details: `São necessárias pelo menos 5 imagens. Recebidas: ${imageFiles?.length || 0}`
      });
    }

    // Criar ZIP
    const { zipPath, zipName } = await createImagesZip(imageFiles);
    console.log('ZIP criado:', { zipPath, zipName });

    // Upload do ZIP para S3
    console.log('Iniciando upload do ZIP para S3...');
    const zipUrl = await uploadToS3(zipPath, `training-data/${zipName}`);
    console.log('ZIP enviado para S3:', zipUrl);

    // Iniciar treinamento com a URL do S3
    const training = await replicate.trainings.create(
      "ostris",
      "flux-dev-lora-trainer",
      "e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497",
      {
        destination: "portugalgateway/teste",
        input: {
          steps: parseInt(steps),
          lora_rank: parseInt(loraRank),
          optimizer,
          batch_size: parseInt(batchSize),
          resolution,
          autocaption,
          input_images: zipUrl, // URL do S3
          trigger_word: triggerWord,
          learning_rate: parseFloat(learningRate),
          wandb_project: wandbProject,
          wandb_save_interval: parseInt(wandbSaveInterval),
          caption_dropout_rate: parseFloat(captionDropoutRate),
          cache_latents_to_disk: cacheLatentsToDisk,
          wandb_sample_interval: parseInt(wandbSampleInterval)
        }
      }
    );

    // Limpar arquivo ZIP local após envio
    setTimeout(() => {
      fs.unlink(zipPath, (err) => {
        if (err) console.error('Erro ao deletar arquivo ZIP local:', err);
        else console.log('Arquivo ZIP local removido com sucesso');
      });
    }, 5000);

    res.json(training);
  } catch (error) {
    console.error('Erro detalhado:', error);
    res.status(500).json({
      error: 'Erro ao iniciar o treinamento',
      details: error.message
    });
  }
});

// rota para geração de imagem
app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt, extra_lora } = req.body;
    
    console.log('Gerando imagem com:', {
      prompt,
      extra_lora: extra_lora || 'Nenhum modelo extra'
    });

    const output = await replicate.run(
      "fofr/flux-tesla-robovan:75f4226a56e37b3d81a257ee2f9c18166b146e9d0018babd4f0a10b1e6e89be8",
      {
        input: {
          model: "dev",
          prompt: prompt,
          lora_scale: 1,
          num_outputs: 1,
          aspect_ratio: "3:2",
          output_format: "png",
          guidance_scale: 3.5,
          output_quality: 90,
          prompt_strength: 0.8,
          extra_lora_scale: 1,
          num_inference_steps: 28,
          extra_lora: extra_lora || "" // URL do .safetensors da AWS
        }
      }
    );

    const imageUrl = Array.isArray(output) ? output[0] : output;
    
    const imageResponse = await fetch(imageUrl);
    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString('base64');

    console.log('Imagem gerada com sucesso');

    res.json({ 
      imageUrl,
      base64Image: `data:image/webp;base64,${base64Image}`
    });
  } catch (error) {
    console.error('Erro ao gerar imagem:', error);
    res.status(500).json({ 
      error: 'Erro ao gerar imagem',
      details: error.message 
    });
  }
});

// Servir arquivos estáticos da pasta uploads
app.use('/uploads', express.static('uploads'));

// Iniciar o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Diretório de uploads: ${uploadsDir}`);
});