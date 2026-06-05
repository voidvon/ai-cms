<!--
function lookmagic(i)
{
	var obj=document.getElementById("magicframe("+i+")");
	var buttonElement = document.getElementById("magicfacepic("+i+")");
	if (obj.style.visibility=="hidden")
	{
		obj.style.top = (getOffsetTop(buttonElement) + buttonElement.offsetHeight)+"px";
		obj.style.left = (getOffsetLeft(buttonElement))+"px";
		obj.style.visibility="visible";
	}else {
		obj.style.visibility="hidden";
	}
}
function closemagic(i)
{
	var cm=document.getElementById("magicframe("+i+")");
	if (cm.style.visibility=="visible")
	{
		cm.style.visibility = "hidden";
	}
}
//Colour pallete top offset
function getOffsetTop(elm) {
	var mOffsetTop = elm.offsetTop;
	var mOffsetParent = elm.offsetParent;
	while(mOffsetParent){
		mOffsetTop += mOffsetParent.offsetTop;
		mOffsetParent = mOffsetParent.offsetParent;
	}
	return mOffsetTop;
}

//Colour pallete left offset
function getOffsetLeft(elm) {
	var mOffsetLeft = elm.offsetLeft;
	var mOffsetParent = elm.offsetParent;
	while(mOffsetParent) {
		mOffsetLeft += mOffsetParent.offsetLeft;
		mOffsetParent = mOffsetParent.offsetParent;
	}
	return mOffsetLeft;
}
-->

