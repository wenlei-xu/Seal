export const fixture = {
  'film.svs': '<?svml using="@hypit/svs@1"?><sheet version="1">film.main { background: #142b32; }</sheet>',
  'main.svml': `<?svml using="@hypit/markup@1"?><svml>
    <import as="time" from="@hypit/timeline-author@1"/><import as="spatial" from="@hypit/spatial@1"/>
    <import as="film" from="@hypit/film@1"/><import as="scene" from="@beeftv/test-scene@1"/>
    <import as="asset" from="@hypit/media@1"/>
    <import as="style" source="./film.svs"/>
    <asset:Image id="product" src="__INPUT__"/>
    <time:Clock id="clock" frame-rate="24"/><time:Timeline id="animation" clock={clock} end="3s"/>
    <spatial:Canvas id="canvas" width="320" height="480"/>
    <scene:Scene id="opening" timeline={animation.timeline} canvas={canvas} image={product}/>
    <film:Film id="main" canvas={canvas} timeline={animation.timeline} appearance={style.film.main}><film:Track source={opening.track}/></film:Film>
  </svml>`,
  'main.svrun': '<?svml using="@hypit/run-markup@1"?><svrun version="1"><author source="./main.svml"/><target output="main.composition"/><target output="animation.timeline"/></svrun>',
  'packages/scene/package.json': JSON.stringify({ name: '@beeftv/test-scene', version: '0.1.0', type: 'module', hypit: { activation: './activation.mjs' } }),
  'packages/scene/activation.mjs': `
    import { canonicalize, createMarkupSurfaceHostFacet, sealGraphFragment, textAttribute } from '@hypit/hypit/author-kit';
    import { compositionTypes, sealVisualTrack } from '@hypit/hypit/composition';
    import { timelineTypes } from '@hypit/hypit/timeline';
    import { spatialTypes } from '@hypit/hypit/spatial';
    import { browserProgram } from '@hypit/hypit/hyperframes';
    import { mediaTypes } from '@hypit/hypit/media';
    const module={name:'@beeftv/test-scene',version:'1'};
    const producer={module,name:'render'};
    const manifest={format:'hypit.module@1',...module,dependencies:[compositionTypes.visualTrack,timelineTypes.track,spatialTypes.canvas,mediaTypes.blobArtifact].map(type=>({module:type.module})),types:[],capabilities:[],
      producers:[{name:'render',inputs:[{name:'timeline',type:timelineTypes.track},{name:'canvas',type:spatialTypes.canvas},{name:'image',type:mediaTypes.blobArtifact}],outputs:[{name:'track',type:compositionTypes.visualTrack}],needs:[]}]};
    const component={producers:[{producer,handler:({inputs})=>{
      const timeline=inputs.timeline.value.value;
      const frames=Math.round(timeline.durationSec*timeline.frameRate.numerator/timeline.frameRate.denominator);
      const track=sealVisualTrack({id:'authored-motion',programSpaceId:timeline.id,visualIr:'hypit.visual-ir@1',presents:[{id:'scene',span:{startFrame:0,endFrameExclusive:frames},stacking:{order:0,tieBreak:'scene'},elements:[{id:'motion',order:0,kind:'program',style:[],program:browserProgram({html:'<div class="marker"></div>',css:'.marker{position:absolute;left:30px;top:100px;width:64px;height:64px;background:#72edbd}',setup:'const marker=root.querySelector(".marker");return frame=>{marker.style.transform="translateX("+frame+"px)";};'})}]}]});
      const withImage=sealVisualTrack({...track,presents:[...track.presents,{id:'product',span:{startFrame:0,endFrameExclusive:frames},stacking:{order:1,tieBreak:'product'},elements:[{id:'photo',order:0,kind:'image',style:[],artifact:inputs.image.value}]}]});
      return {outputs:{track:{kind:'inline',value:canonicalize(withImage)}},needs:{}};
    }}]};
    const declaration={name:'scene',tag:'Scene',mode:'structured',outputs:[compositionTypes.visualTrack],vocabulary:{summary:'Test scene',attributes:[],children:[],ports:[],example:'<scene:Scene/>'}};
    const handler=({element,resolveReference})=>{
      const id=textAttribute(element,'id');
      const timeline=resolveReference(element.attributes.timeline.path),canvas=resolveReference(element.attributes.canvas.path);
      const image=resolveReference(element.attributes.image.path);
      const fragment=sealGraphFragment({inputs:[{name:'timeline',type:timelineTypes.track},{name:'canvas',type:spatialTypes.canvas},{name:'image',type:mediaTypes.blobArtifact}],operations:[{id:'render',producer,inputs:{timeline:{kind:'fragment-input',name:'timeline'},canvas:{kind:'fragment-input',name:'canvas'},image:{kind:'fragment-input',name:'image'}},result:{kind:'output',name:'track'}}],exports:[{name:'track',type:compositionTypes.visualTrack,root:{kind:'fragment-operation',operation:'render'}}]});
      return {records:[],fragments:[fragment],components:[{id,fragment:fragment.id,inputs:{timeline:timeline.ref,canvas:canvas.ref,image:image.ref},outputs:{track:id+'.track'},range:element.range}],exports:[id+'.track']};
    };
    export default {format:'hypit.node-package@1',modules:[{manifest}],components:[component],hostFacets:[createMarkupSurfaceHostFacet({module,declaration,handler})]};
  `,
};
