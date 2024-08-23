
'use strict';
const fetchJsonFile = await fetch("./api.json")
const DID_API = await fetchJsonFile.json()

if (DID_API.key == '🤫') alert('Please put your api key inside ./api.json and restart..');

const RTCPeerConnection = (
  window.RTCPeerConnection ||
  window.webkitRTCPeerConnection ||
  window.mozRTCPeerConnection
).bind(window);

let peerConnection;
let streamId;
let sessionId;
let sessionClientAnswer;
let statsIntervalId;
let videoIsPlaying;
let lastBytesReceived;
let agentId;
let chatId;

const videoElement = document.getElementById('video-element');
videoElement.setAttribute('playsinline', '');
const peerStatusLabel = document.getElementById('peer-status-label');
const iceStatusLabel = document.getElementById('ice-status-label');
const iceGatheringStatusLabel = document.getElementById('ice-gathering-status-label');
const signalingStatusLabel = document.getElementById('signaling-status-label');
const streamingStatusLabel = document.getElementById('streaming-status-label');
const agentIdLabel = document.getElementById('agentId-label');
const chatIdLabel = document.getElementById('chatId-label');
const textArea = document.getElementById("textArea");

// Play the idle video when the page is loaded
window.onload = (event) => {

  playIdleVideo()

  if (agentId == "" || agentId == undefined) {
    console.log("Empty 'agentID' and 'chatID' variables\n\n1. Click on the 'Create new Agent with Knowledge' button\n2. Open the Console and wait for the process to complete\n3. Press on the 'Connect' button\n4. Type and send a message to the chat\nNOTE: You can store the created 'agentID' and 'chatId' variables at the bottom of the JS file for future chats")
  } else {
    console.log("You are good to go!\nClick on the 'Connect Button', Then send a new message\nAgent ID: ", agentId, "\nChat ID: ", chatId)
    agentIdLabel.innerHTML = agentId
    chatIdLabel.innerHTML = chatId
  }
}
async function createPeerConnection(offer, iceServers) {
  if (!peerConnection) {
    peerConnection = new RTCPeerConnection({ iceServers });
    peerConnection.addEventListener('icegatheringstatechange', onIceGatheringStateChange, true);
    peerConnection.addEventListener('icecandidate', onIceCandidate, true);
    peerConnection.addEventListener('iceconnectionstatechange', onIceConnectionStateChange, true);
    peerConnection.addEventListener('connectionstatechange', onConnectionStateChange, true);
    peerConnection.addEventListener('signalingstatechange', onSignalingStateChange, true);
    peerConnection.addEventListener('track', onTrack, true);
  }

  await peerConnection.setRemoteDescription(offer);
  console.log('set remote sdp OK');

  const sessionClientAnswer = await peerConnection.createAnswer();
  console.log('create local sdp OK');

  await peerConnection.setLocalDescription(sessionClientAnswer);
  console.log('set local sdp OK');


  // Data Channel creation (for dispalying the Agent's responses as text)
  let dc = await peerConnection.createDataChannel("JanusDataChannel");
  dc.onopen = () => {
    console.log("datachannel open");
  };

  let decodedMsg;
  // Agent Text Responses - Decoding the responses, pasting to the HTML element
  dc.onmessage = (event) => {
    let msg = event.data
    let msgType = "chat/answer:"
    if (msg.includes(msgType)) {
      msg = decodeURIComponent(msg.replace(msgType, ""))
      console.log(msg)
      decodedMsg = msg
      return decodedMsg
    }
    if (msg.includes("stream/started")) {
      console.log(msg)
      document.getElementById("msgHistory").innerHTML += `<span>${decodedMsg}</span><br><br>`
    }
    else {
      console.log(msg)
    }
  };

  dc.onclose = () => {
    console.log("datachannel close");
  };

  return sessionClientAnswer;
}
function onIceGatheringStateChange() {
  iceGatheringStatusLabel.innerText = peerConnection.iceGatheringState;
  iceGatheringStatusLabel.className = 'iceGatheringState-' + peerConnection.iceGatheringState;
}
function onIceCandidate(event) {
  if (event.candidate) {
    const { candidate, sdpMid, sdpMLineIndex } = event.candidate;

    // WEBRTC API CALL 3 - Submit network information
    fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}/ice`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${DID_API.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        candidate,
        sdpMid,
        sdpMLineIndex,
        session_id: sessionId,
      }),
    });
  }
}
function onIceConnectionStateChange() {
  iceStatusLabel.innerText = peerConnection.iceConnectionState;
  iceStatusLabel.className = 'iceConnectionState-' + peerConnection.iceConnectionState;
  if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'closed') {
    stopAllStreams();
    closePC();
  }
}
function onConnectionStateChange() {
  // not supported in firefox
  peerStatusLabel.innerText = peerConnection.connectionState;
  peerStatusLabel.className = 'peerConnectionState-' + peerConnection.connectionState;
}
function onSignalingStateChange() {
  signalingStatusLabel.innerText = peerConnection.signalingState;
  signalingStatusLabel.className = 'signalingState-' + peerConnection.signalingState;
}
function onVideoStatusChange(videoIsPlaying, stream) {
  let status;
  if (videoIsPlaying) {
    status = 'streaming';

    const remoteStream = stream;
    setVideoElement(remoteStream);
  } else {
    status = 'empty';
    playIdleVideo();
  }
  streamingStatusLabel.innerText = status;
  streamingStatusLabel.className = 'streamingState-' + status;
}
function onTrack(event) {
  /**
   * The following code is designed to provide information about wether currently there is data
   * that's being streamed - It does so by periodically looking for changes in total stream data size
   *
   * This information in our case is used in order to show idle video while no video is streaming.
   * To create this idle video use the POST https://api.d-id.com/talks (or clips) endpoint with a silent audio file or a text script with only ssml breaks
   * https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html#break-tag
   * for seamless results use `config.fluent: true` and provide the same configuration as the streaming video
   */

  if (!event.track) return;

  statsIntervalId = setInterval(async () => {
    const stats = await peerConnection.getStats(event.track);
    stats.forEach((report) => {
     if (report.type === 'inbound-rtp' && report.kind === 'video') {

        const videoStatusChanged = videoIsPlaying !== report.bytesReceived > lastBytesReceived;

        if (videoStatusChanged) {
          videoIsPlaying = report.bytesReceived > lastBytesReceived;
          onVideoStatusChange(videoIsPlaying, event.streams[0]);
        }
        lastBytesReceived = report.bytesReceived;
      }
    });
  }, 500);
}
function setVideoElement(stream) {
  if (!stream) return;
  // Add Animation Class
  videoElement.classList.add("animated")

  // Removing browsers' autoplay's 'Mute' Requirement
  videoElement.muted = false;

  videoElement.srcObject = stream;
  videoElement.loop = false;

  // Remove Animation Class after it's completed
  setTimeout(() => {
    videoElement.classList.remove("animated")
  }, 1000);

  // safari hotfix
  if (videoElement.paused) {
    videoElement
      .play()
      .then((_) => { })
      .catch((e) => { });
  }
}
function playIdleVideo() {
  // Add Animation Class
  videoElement.classList.toggle("animated")

  videoElement.srcObject = undefined;
  videoElement.src = 'emma_idle.mp4';
  videoElement.loop = true;

  // Remove Animation Class after it's completed
  setTimeout(() => {
    videoElement.classList.remove("animated")
  }, 1000);
}
function stopAllStreams() {
  if (videoElement.srcObject) {
    console.log('stopping video streams');
    videoElement.srcObject.getTracks().forEach((track) => track.stop());
    videoElement.srcObject = null;
  }
}
function closePC(pc = peerConnection) {
  if (!pc) return;
  console.log('stopping peer connection');
  pc.close();
  pc.removeEventListener('icegatheringstatechange', onIceGatheringStateChange, true);
  pc.removeEventListener('icecandidate', onIceCandidate, true);
  pc.removeEventListener('iceconnectionstatechange', onIceConnectionStateChange, true);
  pc.removeEventListener('connectionstatechange', onConnectionStateChange, true);
  pc.removeEventListener('signalingstatechange', onSignalingStateChange, true);
  pc.removeEventListener('track', onTrack, true);
  clearInterval(statsIntervalId);
  iceGatheringStatusLabel.innerText = '';
  signalingStatusLabel.innerText = '';
  iceStatusLabel.innerText = '';
  peerStatusLabel.innerText = '';
  console.log('stopped peer connection');
  if (pc === peerConnection) {
    peerConnection = null;
  }
}
const maxRetryCount = 3;
const maxDelaySec = 4;
async function fetchWithRetries(url, options, retries = 1) {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (retries <= maxRetryCount) {
      const delay = Math.min(Math.pow(2, retries) / 4 + Math.random(), maxDelaySec) * 1000;

      await new Promise((resolve) => setTimeout(resolve, delay));

      console.log(`Request failed, retrying ${retries}/${maxRetryCount}. Error ${err}`);
      return fetchWithRetries(url, options, retries + 1);
    } else {
      throw new Error(`Max retries exceeded. error: ${err}`);
    }
  }
}

const connectButton = document.getElementById('connect-button');
connectButton.onclick = async () => {
  if (agentId == "" || agentId === undefined) {
    return alert("1. Click on the 'Create new Agent with Knowledge' button\n2. Open the Console and wait for the process to complete\n3. Press on the 'Connect' button\n4. Type and send a message to the chat\nNOTE: You can store the created 'agentID' and 'chatId' variables at the bottom of the JS file for future chats")
  }

  if (peerConnection && peerConnection.connectionState === 'connected') {
    return;
  }
  stopAllStreams();
  closePC();

  // WEBRTC API CALL 1 - Create a new stream
  const sessionResponse = await fetchWithRetries(`${DID_API.url}/${DID_API.service}/streams`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${DID_API.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source_url: 'https://logicoycreativo.com/did/a.jpg'
    }),
  });


  const { id: newStreamId, offer, ice_servers: iceServers, session_id: newSessionId } = await sessionResponse.json();
  streamId = newStreamId;
  sessionId = newSessionId;
  try {
    sessionClientAnswer = await createPeerConnection(offer, iceServers);
  } catch (e) {
    console.log('error during streaming setup', e);
    stopAllStreams();
    closePC();
    return;
  }

  // WEBRTC API CALL 2 - Start a stream
  const sdpResponse = await fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}/sdp`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${DID_API.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      answer: sessionClientAnswer,
      session_id: sessionId,
    }),
  });
};

const startButton = document.getElementById('start-button');
startButton.onclick = async () => {
  // connectionState not supported in firefox
  if (peerConnection?.signalingState === 'stable' || peerConnection?.iceConnectionState === 'connected') {

    // Pasting the user's message to the Chat History element
    document.getElementById("msgHistory").innerHTML += `<span style='opacity:0.5'><u>User:</u> ${textArea.value}</span><br>`

    // Storing the Text Area value
    let txtAreaValue = document.getElementById("textArea").value

    // Clearing the text-box element
    document.getElementById("textArea").value = ""


    // Agents Overview - Step 3: Send a Message to a Chat session - Send a message to a Chat
    const playResponse = await fetchWithRetries(`${DID_API.url}/agents/${agentId}/chat/${chatId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${DID_API.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        "streamId": streamId,
        "sessionId": sessionId,
        "messages": [
          {
            "role": "user",
            "content": txtAreaValue,
            "created_at": new Date().toString()
          }
        ]
      }),
    });
    const playResponseData = await playResponse.json();
    if (playResponse.status === 200 && playResponseData.chatMode === 'TextOnly') {
      console.log('User is out of credit, API only return text messages');
      document.getElementById(
        'msgHistory'
      ).innerHTML += `<span style='opacity:0.5'> ${playResponseData.result}</span><br>`;
    }
  }
};

const destroyButton = document.getElementById('destroy-button');
destroyButton.onclick = async () => {
  await fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Basic ${DID_API.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session_id: sessionId }),
  });

  stopAllStreams();
  closePC();
};

// Agents API Workflow
async function agentsAPIworkflow() {
  agentIdLabel.innerHTML = `<span style='color:orange'>Processing...<style='color:orange'>`
  chatIdLabel.innerHTML = `<span style='color:orange'>Processing...<style='color:orange'>`
  axios.defaults.baseURL = `${DID_API.url}`;
  axios.defaults.headers.common['Authorization'] = `Basic ${DID_API.key}`
  axios.defaults.headers.common['content-type'] = 'application/json'

  // Retry Mechanism (Polling) for this demo only - Please use Webhooks in real life applications! 
  // as described in https://docs.d-id.com/reference/knowledge-overview#%EF%B8%8F-step-2-add-documents-to-the-knowledge-base
  async function retry(url, retries = 1) {
    const maxRetryCount = 5; // Maximum number of retries
    const maxDelaySec = 10; // Maximum delay in seconds
    try {
      let response = await axios.get(`${url}`)
      if (response.data.status == "done") {
        return console.log(response.data.id + ": " + response.data.status)
      }
      else {
        throw new Error("Status is not 'done'")
      }
    } catch (err) {
      if (retries <= maxRetryCount) {
        const delay = Math.min(Math.pow(2, retries) / 4 + Math.random(), maxDelaySec) * 1000;

        await new Promise((resolve) => setTimeout(resolve, delay));

        console.log(`Retrying ${retries}/${maxRetryCount}. ${err}`);
        return retry(url, retries + 1);
      } else {
        agentIdLabel.innerHTML = `<span style='color:red'>Failed</span>`
        chatIdLabel.innerHTML = `<span style='color:red'>Failed</span>`
        throw new Error(`Max retries exceeded. error: ${err}`);
      }
    }
  }

  // Knowledge Overview - Step 1: Create a new Knowledge Base
  // https://docs.d-id.com/reference/knowledge-overview#%EF%B8%8F-step-1-create-a-new-knowledge-base
  const createKnowledge = await axios.post('/knowledge',
    {
      name: "knowledge",
      description: "D-ID Agents API"
    })
  console.log("Create Knowledge:", createKnowledge.data)

  let knowledgeId = createKnowledge.data.id
  console.log("Knowledge ID: " + knowledgeId)

  // Knowledge Overview - Step 2: Add Documents to the Knowledge Base
  // https://docs.d-id.com/reference/knowledge-overview#%EF%B8%8F-step-2-add-documents-to-the-knowledge-base

  const createDocument = await axios.post(`/knowledge/${knowledgeId}/documents`,
    {
      "documentType": "pdf",
      "source_url": "https://d-id-public-bucket.s3.us-west-2.amazonaws.com/Prompt_engineering_Wikipedia.pdf",
      "title": "Prompt Engineering Wikipedia Page PDF",
    })
  console.log("Create Document: ", createDocument.data)

  // Split the # to use in documentID
  let documentId = createDocument.data.id
  let splitArr = documentId.split("#")
  documentId = splitArr[1]
  console.log("Document ID: " + documentId)


  // Knowledge Overview - Step 3: Retrieving the Document and Knowledge status
  // https://docs.d-id.com/reference/knowledge-overview#%EF%B8%8F-step-3-retrieving-the-document-and-knowledge-status
  await retry(`/knowledge/${knowledgeId}/documents/${documentId}`)
  await retry(`/knowledge/${knowledgeId}`)

  // Agents Overview - Step 1: Create an Agent
  // https://docs.d-id.com/reference/agents-overview#%EF%B8%8F-step-1-create-an-agent
  const createAgent = await axios.post('/agents',
    {
      "knowledge": {
        "provider": "pinecone",
        "embedder": {
          "provider": "azure-open-ai",
          "model": "text-large-003"
        },
        "id": knowledgeId
      },
      "presenter": {
        "type": "talk",
        "voice": {
          "type": "microsoft",
          "voice_id": "en-US-JennyMultilingualV2Neural"
        },
        "thumbnail": "https://logicoycreativo.com/did/a.jpg",
        "source_url": "https://logicoycreativo.com/did/a.jpg"
      },
      "llm": {
        "type": "openai",
        "provider": "openai",
        "model": "gpt-4o-mini",
        "instructions": "Sos Eva, una mujer asistente de la empresa Lógico y Creativo. Hablas en castellano porteño de argentina.Los numeros siempre los decis en letras (por ejemplo 1880, decis mil ochocientos ochenta).. Tu objetivo es el de asesorar al cliente sobre todos nuestros productos y servicios o sobre información de la compañia, no seas literal con la base de conocimiento, sino que usala para inteligentemente asesorar al cliente. Se concisa con tus respuestas, no te extiendas mucho.Si te hacen comentarios desapropiados o te quieren seducir o cortejar, obviamente explicale que sos una asistente, pero entra en el juego del chiste un poco, hace respuestas negandote pero jocosamente, por ejemplo preguntandole si su esposa le parece bien que haga eso si es un hombre etc.. Preguntale siempre el nombre al empezar. Eventos: Tenes la posibilidad de mandarle un mensaje de texto a la persona con la que estas hablando (para eso tenes que pedirle el numero de telefono), para eso, cuando lo consideres en tu respuesta de texto agrega al final de la misma esta estructura (esto no lo leera el cliente, es de uso interno para nuestro sistema, por eso va despues de la respuesta que si leera) [EVENTO: [Mensaje]; TEXTO: [ACA PONE EL TEXTO QUE QUIERAS MANDAR QUE NO EXCEDA 250 CARACTERES];NRO:[ACA PONE EL NUMERO DEL CLIENTE PARA MANDAR EL MENSAJE, tiene que tener la estructura +5411 y luego los 8 numeros de telefono, si el cliente te dice 1558808552 por ejemplo, tomas solamente 58808552 y le das el prefijo osea quedaria +541158808552 el resultado] (siempre mantene esa estructura y el evento debe ser Mensaje para este caso) Ejemplo de texto que debe ir al final del mensaje para enviar un mensaje al cliente: '[EVENTO: [Mensaje]; TEXTO: [esta es una prueba];NRO:[+541158808552]'(como veras hay que mantener los corchetes en cada variable a enviar y el input va dentro de esos corchetes, siempre pone esos corchetes tanto para el texto, el nro y el evento. Base de conocimiento: Lógico y Creativo es una empresa Argentina que posee mas de 10 años en el mercado. Fundada por Pablo Sampietro y Javier Salinas. Desarrollamos software y soluciones tecnológicas de todo tipo, especialmente potenciadas por inteligencia artificial. También ofrecemos servicios que se detallan a continuación: NUESTROS SERVICIOS Tecnologia al servicio de tus ideas. Partners en materia de informatica y nuevas tendencias digitales. Diseño e innovación. SOCIAL MEDIA Potencia tu marca con estrategias innovadoras. Impulsamos tu presencia digital con gestión estratégica y contenido impactante. DISEÑO WEB Desarrollamos webs a medida para tu negocio. Plataformas digitales personalizadas que impulsan tus ventas. INTELIGENCIA ARTIFICIAL Optimizamos ventas con AI. Decisiones estratégicas, resultados avanzados. Potenciando tu éxito con tecnología inteligente. ADS MANAGER Maximiza impacto: Potencia tu presencia. Ads Manager optimiza campañas en Google y Social Media para resultados efectivos. BRANDING Potencia tu marca. Creamos tu identidad: logos, naming. Distingue y perdura. Nuestra creatividad construye tu esencia. HOSTING Y DOMINIOS Gestión de dominios y hosting sin preocupaciones para tu web. Libera tiempo y energía para tu negocio. Nosotros nos encargamos. Hemos realizado varios proyectos aparte, como : TOTEM DE JOSÉ DE SAN MARTÍN Presentamos nuestra última tecnología: una experiencia única para hablar con José de San Martín en tiempo real. Permite revivir la historia de manera interactiva y educativa CHAT CON ICONOS ARGENTINOS Te presentamos #ChatConIconosArgentinos: Una revolución en la conversación virtual desarrollada en Argentina. Compartimos la gacetilla de nuestra inteligencia . LOTIO Una innovadora solución para gestionar las reservas de lotes y propiedades en barrios privados, de forma tecnológica y sencilla LYC-RESTO Una plataforma para que la IA atienda tu restaurante y tome pedidos de forma automática Y el servicio estrella que es TOTEMS DE AVATARS DIGITALES : Desarrollamos un tótem interactivo impulsado por inteligencia artificial, con avatares digitales personalizables que permiten una interactividad fluida con los usuarios. Está diseñado para diversos sectores como educación, atención al cliente, turismo y entretenimiento, salud, retail y ventas - Nuestro producto principal es un tótem interactivo avanzado, equipado con una pantalla táctil, una computadora interna con wifi, micrófono y parlantes. Este tótem posee un software avanzado que permite a los usuarios seleccionar y entrenar avatares digitales personalizados para diversas funciones (potenciado con tecnología de Open AI). Propuesta de valor: Nuestro tótem interactivo avanzado ofrece una experiencia única al permitir a las empresas crear y personalizar avatares digitales para diversas funciones, desde atención al cliente hasta guías turísticos digitales, potenciado por tecnología de inteligencia artificial de Open AI. Equipado con una pantalla táctil, computadora interna con wifi, micrófono y parlantes, nuestro producto redefine la interacción digital al proporcionar soluciones intuitivas y eficaces que mejoran la experiencia del usuario y optimizan las operaciones empresariales Misión y Visión: La misión de Lógico y Creativo es brindar soluciones personalizadas a empresas que buscan vender online, optimizar sus procesos y destacar mediante impacto visual y efectividad lógica. El lema Fusionamos lógica y creatividad para innovar sin límites define nuestra visión de innovación constante y atención personalizada, donde la creatividad y el diseño se integran para alcanzar funcionalidades excepcionales. CONTACTO Nuestro correo electrónico es info@logicoycreativo.com Nuestro sitio web www.logicoycreativo.com Nuestro teléfono es : 11-2758-6070 Nuestra oficina esta en: Av. Olivera 1561 - CABA | Bs.As",
        "template": "rag-ungrounded"
      },
      "preview_name": "Pablo"
    }

  )
  console.log("Create Agent: ", createAgent.data)
  let agentId = createAgent.data.id
  console.log("Agent ID: " + agentId)

  // Agents Overview - Step 2: Create a new Chat session with the Agent
  // https://docs.d-id.com/reference/agents-overview#%EF%B8%8F-step-2-create-a-new-chat-session-with-the-agent
  const createChat = await axios.post(`/agents/${agentId}/chat`)
  console.log("Create Chat: ", createChat.data)
  let chatId = createChat.data.id
  console.log("Chat ID: " + chatId)

  // Agents Overview - Step 3: Send a Message to a Chat session
  // https://docs.d-id.com/reference/agents-overview#%EF%B8%8F-step-3--send-a-message-to-a-chat-session
  // The WebRTC steps are called in the functions: 'connectButton.onclick', onIceCandidate(event), 'startButton.onclick'

  console.log("Create new Agent with Knowledge - DONE!\n Press on the 'Connect' button to proceed.\n Store the created 'agentID' and 'chatId' variables at the bottom of the JS file for future chats")
  agentIdLabel.innerHTML = agentId
  chatIdLabel.innerHTML = chatId
  return { agentId: agentId, chatId: chatId }

}

const agentsButton = document.getElementById("agents-button")
agentsButton.onclick = async () => {
  try{
    const agentsIds = {} = await agentsAPIworkflow()
    console.log(agentsIds)
    agentId = agentsIds.agentId
    chatId = agentsIds.chatId
    return
  }
  catch(err){
    agentIdLabel.innerHTML = `<span style='color:red'>Failed</span>`
    chatIdLabel.innerHTML = `<span style='color:red'>Failed</span>`
    throw new Error(err)
  }
}

// Paste Your Created Agent and Chat IDs Here:
agentId = "agt_Kdj5kSgo"
chatId = "cht_mXXZB3uz8fON41FRuWaQ5"
