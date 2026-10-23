import fs from 'node:fs/promises';
import { Presentation, PresentationFile } from 'file:///C:/Users/hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
import { finalizePresentation } from 'file:///C:/Users/hp/.codex/plugins/cache/openai-primary-runtime/presentations/26.1022.11436/skills/presentations/container_tools/artifact_tool_utils.mjs';
const root='C:/Users/hp/Desktop/OptiTAC';
process.env.RUNTIME_NODE_MODULES='C:/Users/hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const skill='C:/Users/hp/.codex/plugins/cache/openai-primary-runtime/presentations/26.1022.11436/skills/presentations';
const presentation=await Presentation.load(JSON.parse(await fs.readFile(root+'/tmp/deck/presentation.json','utf8')));
// Bind image bytes locally; session media references are not standalone export assets.
const captures={0:'map',2:'pipeline-crop',3:'tokens-crop',4:'syntax-crop',5:'types-crop',6:'tac-crop',8:'logs-crop',9:'trap-crop',12:'scout-crop',14:'quiz-crop'};
for (const [index,slide] of presentation.slides.items.entries()) for (const image of slide.images.items) {
  const file=captures[index];
  if (!file) throw new Error(`No screenshot mapping for slide ${index+1}`);
  const bytes=await fs.readFile(root+'/tmp/town/'+file+'.png');
  image.replace({dataUrl:'data:image/png;base64,'+bytes.toString('base64'),contentType:'image/png',fit:'contain',alt:file});
  image.fit='contain';
}
await (await PresentationFile.exportPptx(presentation)).save(root+'/tmp/deck/candidate.pptx');
console.log('Draft exported',presentation.slides.items.length);
const result=await finalizePresentation({workspaceDir:root,candidatePath:root+'/tmp/deck/candidate.pptx',finalPath:root+'/output/presentations/OptiTAC-Compiler-Town-Presentation.pptx',pythonExecutable:'C:/Users/hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',integrityValidatorPath:skill+'/container_tools/inspect_presentation_package_integrity.py',layoutValidatorPath:skill+'/container_tools/inspect_presentation_layout_geometry.py',layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit'],requiredNativeTableOwnerSlides:[],requiredNativeChartOwnerSlides:[],fontPolicy:{basis:'design',families:['Arial','Georgia','Consolas']},materializeLiteralChartWorkbooks:true,verifyArtifactToolImport:true,receiptPath:root+'/tmp/deck/embedded-final-validation.json'});
console.log(JSON.stringify(result));


