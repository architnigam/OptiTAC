export async function buildTownDeck(presentation, fs) {
  const root='C:/Users/hp/Desktop/OptiTAC';
  const out=root+'/tmp/deck';
  await fs.mkdir(out,{recursive:true});
  const data=JSON.parse(await fs.readFile(root+'/tmp/town/experiment.json','utf8'));
  const metrics=data.scout.evaluation;
  const ink='#344638',muted='#6f7f62',paper='#f6f3ea';
  function text(slide,value,x,y,w,h,size=24,color=ink,font='Arial',bold=false) {
    const t=slide.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
    t.text=value;t.text.style={fontSize:size,color,typeface:font,bold,wrap:'square',verticalAlignment:'top',insets:0,autoFit:'none'};return t;
  }
  function base(title,notes='') {
    const s=presentation.slides.add({width:1280,height:720});s.background.fill=paper;
    text(s,title,64,42,1140,70,42,ink,'Georgia');
    text(s,'optiTAC / Compiler Town',64,678,600,22,14,muted);
    text(s,String(presentation.slides.items.length).padStart(2,'0'),1150,676,65,24,14,muted);
    s.speakerNotes.text=notes;return s;
  }
  async function picture(slide,file,x,y,w,h,fit='contain') {
    const bytes=await fs.readFile(root+'/tmp/town/'+file);
    slide.images.add({dataUrl:'data:image/png;base64,'+bytes.toString('base64'),contentType:'image/png',alt:file.replaceAll('-',' ').replace('.png',''),fit,position:{left:x,top:y,width:w,height:h}});
  }
  function paragraphs(slide,items,x=66,y=160,w=470,size=24,gap=115) {
    items.forEach((value,i)=>text(slide,value,x,y+i*gap,w,gap-18,size));
  }
  function table(slide,values,x,y,w,h,widths) {
    const t=slide.tables.add({rows:values.length,columns:values[0].length,left:x,top:y,width:w,height:h,columnWidths:widths,values});
    for(let r=0;r<values.length;r++) for(let c=0;c<values[0].length;c++) {
      const cell=t.getCell(r,c);cell.fill=r===0?'#dce6ce':r%2?'#eef1e4':paper;
      cell.text.style={fontSize:21,typeface:'Arial',color:r===0?ink:muted,bold:r===0,insets:10};
    }
    return t;
  }
  let s=base('OptiTAC', 'A spatial compiler-learning portal with deterministic compilation, a local ML pass scout, and inspectable optimization evidence. All visual evidence is captured from the local project on 23 October 2026.');
  // Use the town itself as the visual evidence, rather than illustrative slide decorations.
  text(s,'Compiler Town',64,143,480,145,66,ink,'Georgia');
  text(s,'Explore the pipeline.\nQuestion every transformation.',68,330,435,100,28,muted);
  text(s,'Interactive compiler learning\nwith an evidence-checked ML scout',68,500,440,100,23,muted);
  await picture(s,'map.png',565,140,650,450);

  s=base('The learning problem','Compiler stages are often taught as separate definitions or a single before/after output. The design is intended to support exploration; improved learner outcomes have not been measured in a participant study.');
  text(s,'Seeing the result is not enough.',66,153,1080,80,47,ink,'Georgia');
  paragraphs(s,['Where did this artifact come from?','Why did this instruction change?','Did an optimization also change behavior?'],70,287,1070,30,100);

  s=base('A source parcel travels through six stages','Pipeline Express is a visual replay of a completed compilation, not a wall-clock performance visualization. It supports play, pause, rewind and direct selection. Failed stages retain earlier artifacts.');
  paragraphs(s,['One source program stays attached to its artifacts.','The central express view shows the whole route without the longer teaching explanations.','Open a shop for the detailed explanation and experiments.'],64,160,420,24,130);
  await picture(s,'pipeline-crop.png',530,150,685,465);

  s=base('Token Post / lexical analysis','The lexer emits token kind, lexeme, line and column. Whitespace is skipped. EOF is explicit. Identifiers are not checked for declaration until semantic analysis. Select tokens to inspect the classification and position.');
  paragraphs(s,['Characters become keywords, identifiers, literals and punctuation.','Select a token to inspect its spelling and source location.','The complete token ledger is available in an expandable section.'],64,155,410,24,135);
  await picture(s,'tokens-crop.png',520,145,695,485);

  s=base('Syntax Studio / parsing and AST','The recursive-descent parser implements initialized declarations and return expressions. Multiplication, division and remainder bind before addition and subtraction. Parentheses change the subtree. Unary minus is not implemented; use 0 - n.');
  paragraphs(s,['The parser checks grammar and builds a navigable abstract syntax tree.','Operator precedence is visible in parent and child nodes.','Broken syntax stops this stage while the token artifact remains available.'],64,155,415,24,135);
  await picture(s,'syntax-crop.png',520,145,695,485);

  s=base('Type Registry / semantic analysis','Semantic analysis tracks declared symbols and initialization. It rejects duplicate declarations, undeclared names and float-to-int narrowing; int-to-float widening is allowed. Runtime arithmetic still follows JavaScript Number rather than fixed-width C integer semantics.');
  paragraphs(s,['Grammar alone cannot catch every invalid program.','The registry checks names, initialization and basic type compatibility.','Its symbol table makes each declared name and type inspectable.'],64,155,410,24,135);
  await picture(s,'types-crop.png',520,145,695,485);

  s=base('TAC Forge / intermediate representation','AST traversal lowers expressions to assign, binary and return instructions. Reserved $t temporary names cannot collide with source identifiers. IDs stay attached through rewrites and removals.');
  paragraphs(s,['Compound expressions become small three-address instructions.','Stable instruction IDs connect generated code to later rewrite logs.','Reserved temporaries protect user-defined names from collisions.'],64,155,410,24,135);
  await picture(s,'tac-crop.png',520,145,695,485);

  s=base('Repair Garage / the five optimization passes','Pass order is fixed. Selected passes repeat until unchanged or ten rounds. The UI reports convergence. Instruction count is not execution speed. Division and remainder operations that may trap remain observable.');
  table(s,[['Pass','Transformation'],['Constant propagation','Substitute known values into operands'],['Constant folding','Evaluate constant arithmetic'],['Common subexpressions','Reuse a valid earlier computation'],['Copy propagation','Forward a copied value to its source'],['Dead-code elimination','Remove unused, non-trapping results']],66,150,1140,415,[355,785]);
  text(s,'Selected passes repeat to a fixed point or the ten-round cap.',68,603,1100,40,23,muted);

  s=base('Autopsy and detailed intermediate logs','Each snapshot is deep-copied. Logs include before/after TAC, pass/round, instruction IDs, modifications/removals, rewrite explanations, original-versus-current outcomes, and an execution trace with variable states. The first divergent checkpoint is not a formal root-cause proof.');
  paragraphs(s,['Choose a pass and a round.','Inspect the full change ledger, rewrite reasons and variable state after each executed instruction.','The first changed observation is retained even if a later pass masks it.'],64,155,410,24,130);
  await picture(s,'logs-crop.png',520,145,695,485);

  s=base('Watchtower / preserving errors matters','Example: int apples=8; int unused=apples/0; return apples; must still fail after optimization under this interpreter. This is not a claim about C undefined behavior. Successful observations use Object.is; failures compare error messages.');
  paragraphs(s,['An unused result can still carry an observable runtime error.','Deleting division by zero would turn a failing program into a successful return.','The checker compares original and optimized outcomes, including errors.'],64,155,410,24,135);
  await picture(s,'trap-crop.png',520,145,695,485);

  s=base('Counterfactuals / omit one pass and rerun','The omission analysis reruns the entire selected pipeline without one pass. Deltas include interactions, are not additive and do not measure runtime speedup. Fault injection is excluded from these comparisons. Zero can indicate compensation or no applicability.');
  const cf=data.journey.result.counterfactuals;
  table(s,[['Omitted pass','TAC count','Count difference'],...cf.map(c=>[c.pass,String(c.count),(c.delta>0?'+':'')+c.delta])],66,150,1140,385,[650,210,280]);
  text(s,'Market-order example · Positive deltas mean more TAC remains after omission.',68,575,1100,60,24,muted);

  s=base('Scout Office / actual local machine learning','Method reference: https://scikit-learn.org/stable/modules/neighbors.html. The application uses its own TypeScript k-nearest-neighbor implementation; it does not depend on scikit-learn. It predicts isolated-pass rewrite counts, not safety, runtime or global optimal pass order.');
  text(s,'Predict → measure → inspect the disagreement',66,145,1130,75,38,ink,'Georgia');
  paragraphs(s,['Learn from structural TAC examples using distance-weighted k-nearest-neighbor regression.','Predict a rewrite count for each pass using five nearby training examples.','Run every pass on the original TAC to compare the prediction with measured evidence.'],70,270,1080,27,116);

  s=base('The scout exposes its reasoning','Seven features: total instructions, constant assignments, copy assignments, constant binary expressions, repeated expressions, unused targets, divisions/remainders. Training-only mean/std scale the features. Distance-weighted means use five training neighbors; exact matches share equal weight.');
  paragraphs(s,['Seven structural features; no source-code embedding or API call.','Neighbor IDs, distances and stored target counts are inspectable.','The scout suggests what to investigate. Compiler execution checks remain separate and authoritative.'],64,155,415,24,135);
  await picture(s,'scout-crop.png',520,145,695,485);

  s=base('Measured ML performance','Evaluation generated from src/compiler/ml/scout.ts. Fixed split: 192 training samples and 48 held-out synthetic TAC programs. All held-out samples are excluded from training-only scaling and neighbor selection. Structurally similar examples can cross the split. Top-choice agreement accepts any pass tied for the largest measured isolated rewrite count. Results are 43/48 for kNN and 42/48 for the majority-pass baseline; the one-case gain is not evidence of statistical significance or generalization.');
  const acc=100*metrics.topChoiceAccuracy,baselineAcc=100*metrics.baselineAccuracy;
  text(s,`${metrics.trainCount} training / ${metrics.testCount} held-out synthetic programs`,66,143,1120,45,26,muted);
  const chart=s.charts.add('bar',{position:{left:66,top:220,width:760,height:355},categories:['Local kNN scout','Majority-pass baseline'],series:[{name:'Top-choice agreement (%)',values:[Number(acc.toFixed(1)),Number(baselineAcc.toFixed(1))],fill:'#6e8b5b'}],barOptions:{direction:'bar',grouping:'clustered'},hasLegend:false,dataLabels:{showValue:true,position:'outEnd',numberFormatCode:'0.0"%"',textStyle:{fontSize:22,typeface:'Arial',color:ink}},xAxis:{textStyle:{fontSize:21,typeface:'Arial',color:muted}},yAxis:{min:0,max:100,majorUnit:25,numberFormatCode:'0"%"',textStyle:{fontSize:20,typeface:'Arial',color:muted}},chartFill:paper,plotAreaFill:paper});
  text(s,'Mean absolute error',880,240,320,50,23,muted);
  text(s,metrics.meanAbsoluteError.toFixed(3),880,305,320,80,62,ink,'Georgia');
  text(s,'rewrites per pass',883,400,300,45,23,muted);
  text(s,'A small synthetic evaluation, not an accuracy guarantee on arbitrary programs.',66,610,1140,48,23,muted);

  s=base('Challenge Hall / game progress with feedback','Seven questions cover lexer, parser, semantics, TAC, optimization, verification and ML. Correct answers award unique passport stamps; wrong answers explain the concept and allow another attempt. Stamps persist in localStorage if available. Visiting places is tracked separately and does not award knowledge stamps. Tools never require an unlock.');
  paragraphs(s,['Seven knowledge challenges earn seven passport stamps.','Wrong answers explain the idea; a correct answer cannot earn duplicate stamps.','Every shop stays open. Progress supports exploration rather than restricting it.'],64,155,410,24,135);
  await picture(s,'quiz-crop.png',520,145,695,485);

  s=base('Validation coverage','Evidence: npm test; npm run build; npm run lint; scripts/town-browser.mjs. Independent arithmetic expressions cover 60 generated source expressions across all 32 pass subsets = 1,920 program/subset cases. Sixty synthetic IR programs are checked against all five isolated passes = 300 checks. Automated tests are not proof of correctness for all inputs.');
  table(s,[['Check','Evidence'],['Automated test cases','126 passing cases across two test files'],['Independent arithmetic oracle','60 expressions × 32 pass subsets = 1,920 cases'],['Isolated-pass observations','60 synthetic programs × 5 passes = 300 checks'],['Numeric / error regressions','Signed zero, scientific notation, NaN, traps'],['Browser journeys','8 shops, replay, logs, export, stamps, mobile, offline']],66,145,1140,420,[390,750]);
  text(s,'Tested behavior is reported explicitly; universal correctness is not claimed.',68,608,1100,45,23,muted);

  s=base('The proposed contribution','Related work: LLVM OptBisect https://llvm.org/docs/OptBisect.html; LLVM optimization remarks https://llvm.org/docs/Remarks.html; Alive2 https://github.com/AliveToolkit/alive2; nearest-neighbor regression https://scikit-learn.org/stable/modules/neighbors.html. All accessed 23 October 2026. These establish related foundations. The project does not claim to invent pass debugging, validation, kNN or gamification, and no publication acceptance or learner-outcome study exists.');
  text(s,'A spatial, evidence-checked learning loop',66,145,1140,80,43,ink,'Georgia');
  paragraphs(s,['A program becomes a parcel with an artifact at each shop.','Optimization experiments expose both behavior and pass interactions.','An inspectable ML suggestion is checked against compiler evidence, so disagreement becomes a teaching moment.'],70,280,1100,28,110);

  s=base('Project boundaries and research next steps','Current grammar is a straight-line MiniC-inspired subset with initialized int/float declarations and returns. JavaScript Number arithmetic is explicit. No branches, loops, CFG, symbolic proof or external runtime inputs are implemented. Learning-program bounds limit source and TAC size to keep trace memory readable. Research evaluation should compare baseline explanation views with the spatial workflow and add structurally grouped external datasets.');
  text(s,'Implemented',68,150,500,55,32,ink,'Georgia');
  text(s,'Local compiler, inspectable artifacts, five-pass experiments, detailed traces, local ML, passport challenges and evidence export.',68,230,500,245,28,muted);
  text(s,'Still open',695,150,500,55,32,ink,'Georgia');
  text(s,'Branching and loops; symbolic checking; stronger external ML evaluation; measured learner outcomes.',695,230,500,245,28,muted);
  text(s,'The integrated workflow is a research direction. Novelty and publication require broader comparison and evaluation.',68,555,1110,75,24,muted);

  s=base('Demonstration route','Suggested demo: launch npm run dev; open Town map; send the market order; visit Token Post, Syntax Studio and Repair Garage; play Pipeline Express; inspect the ML predictions and held-out evaluation; answer a challenge; load and compile the hidden trap; compare errors at Watchtower; toggle injected fault to show first divergence; export evidence JSON. Explain that replay is a completed-run visualization and that the seeded fault is artificial.');
  text(s,'npm run dev',68,152,1120,90,52,ink,'Consolas');
  paragraphs(s,['Market order → visit the frontend shops → replay the pipeline','Repair Garage → inspect intermediate logs → ask the ML scout','Hidden trap → preserve the runtime error → export the evidence'],72,304,1100,28,93);
  text(s,'Questions welcome at any stop.',72,604,1000,45,29,ink,'Georgia');
  await fs.writeFile(out+'/deck-spec.json',JSON.stringify({slides:presentation.slides.items.length,metrics,fonts:['Arial','Georgia','Consolas']},null,2));
  return presentation.slides.items.length;
}

